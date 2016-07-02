
// CLI usage:
// phantomjs [--ssl-protocol=any] ge-cancellation-checker.phantom.js [-v|--verbose]

var system = require('system');
var fs = require('fs');

var VERBOSE = false;
var loadInProgress = false;
var readyToExit = false;

// Calculate path of this file
var PWD = '';
var current_path_arr = system.args[0].split('/');
if (current_path_arr.length == 1) { PWD = '.'; }
else {
    current_path_arr.pop();
    PWD = current_path_arr.join('/');
}

// Gather Settings...
try {
    var settings = JSON.parse(fs.read(PWD + '/config.json'));
    if (!settings.username || !settings.username || !settings.init_url || !settings.enrollment_location_id) {
        console.log('Missing username, password, enrollment location ID, and/or initial URL. Exiting...');
        phantom.exit();
    }
}
catch(e) {
    console.log('Could not find config.json');
    phantom.exit();
}

// ...from command
system.args.forEach(function(val, i) {
    if (val == '-v' || val == '--verbose') { VERBOSE = true; }
});

function fireClick(el) {
    var ev = document.createEvent("MouseEvents");
    ev.initEvent("click", true, true);
    el.dispatchEvent(ev);
}

var page = require('webpage').create();

page.onConsoleMessage = function(msg) {
    if (!VERBOSE) { return; }
    console.log(msg);
};

page.onError = function(msg, trace) {
    if (!VERBOSE) { return; }
    console.error('Error on page: ' + msg);
}

page.onCallback = function(query, msg) {
    if (query == 'username') { return settings.username; }
    if (query == 'password') { return settings.password; }
    if (query == 'fireClick') {
        return function() { return fireClick; } // @todo:david DON'T KNOW WHY THIS DOESN'T WORK! :( Just returns [Object object])
    }
    if (query == 'report-interview-time') {
        if (VERBOSE) { console.log('Next available appointment is at: ' + msg); }
        else { console.log(msg); }
        return;  
    }
    if (query == 'fatal-error') {
        console.log('Fatal error: ' + msg);
        phantom.exit();
    }
    return null;
}

page.onLoadStarted = function() { loadInProgress = true; };
page.onLoadFinished = function() { loadInProgress = false; };

page.onResourceReceived = function(response) {
    // console.log('resource received: ' + response.url);    
}

page.onResourceError = function(resourceError) {
  console.log('resource error! ' + resourceError);
}

if (VERBOSE) { console.log('Please wait...'); }

page.open(settings.init_url);
var steps = [
    function() { // Log in
        page.evaluate(function() {
            console.log('On GOES login page...');
            document.querySelector('input[name=username]').value = window.callPhantom('username');
            document.querySelector('input[name=password]').value = window.callPhantom('password');
            document.querySelector('form[action="/pkmslogin.form"]').submit();
            console.log('Logging in...');
        });
    },
    function() { // Accept terms
        page.evaluate(function() {
            
            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }
            
            var $acceptTermsBtn = document.querySelector('a[href="/main/goes/HomePagePreAction.do"]');

            if (!$acceptTermsBtn) {
                return window.callPhantom('fatal-error', 'Unable to find terms acceptance button');
            }

            fireClick($acceptTermsBtn);
            console.log('Accepting terms...');
        });
    },
    function() { // main dashboard
        page.evaluate(function() {

            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }
            
            var $manageAptBtn = document.querySelector('.bluebutton[name=manageAptm]');
            if (!$manageAptBtn) {
                return window.callPhantom('fatal-error', 'Unable to find Manage Appointment button');
            }

            fireClick($manageAptBtn);
            console.log('Entering appointment management...');
        });
    },
    function() {
        page.evaluate(function() {

            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }
            
            var $rescheduleBtn = document.querySelector('input[name=reschedule]');
    
            if (!$rescheduleBtn) {
                return window.callPhantom('fatal-error', 'Unable to find reschedule button. Is it after or less than 24 hrs before your appointment?');
            }

            fireClick($rescheduleBtn);
            console.log('Entering rescheduling selection page...');
        });
    },
    function() {
        page.evaluate(function(location_id) {

            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }

            document.querySelector('select[name=selectedEnrollmentCenter]').value = location_id;
            fireClick(document.querySelector('input[name=next]'));
            console.log('Choosing SFO...');
        }, settings.enrollment_location_id.toString());
    },
    function() {
        page.evaluate(function(currentAppointmentString) {

            function fireMouseUp(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("mouseup", true, true);
                el.dispatchEvent(ev);
            }

            // We made it! Now we have to scrape the page for the earliest available date
            
            var date = document.querySelector('.date table tr:first-child td:first-child').innerHTML;
            var month_year = document.querySelector('.date table tr:last-child td:last-child div').innerHTML;

            var full_date = month_year.replace(',', ' ' + date + ',');
            var dateObj = new Date(full_date);

            console.log('Current appointment is: ' + currentAppointmentString);
            var currentAppointment = new Date(Date.parse(currentAppointmentString));
            console.log('on prev Page ' + document.title);

            if (dateObj >= currentAppointment) {
              return window.callPhantom('report-interview-time', full_date);
            } else {
              var nextOpenTime = document.querySelector('table.foreground').querySelector('a.entry');
              fireMouseUp(nextOpenTime)
            }
            // console.log('');
            // console.log('The next available appointment is on ' + full_date + '.');
        }, settings.current_interview_date_str);
    },
    function() {
        // page.onUrlChanged = function(targetUrl) {
        //     console.log('url changed to ' + targetUrl);
        //     readyToExit = true;
        // }
        page.evaluate(function() {

            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }

            // Now on the confirm page, need to set a reason and confirm
            // First, grab our new Date again
            console.log('on Page ' + document.title);
            console.log('url ' + window.location.href);
            var ds = document.querySelector('.mainContent .maincontainer').querySelectorAll('p')[8].innerText;
            var ts = document.querySelector('.mainContent .maincontainer').querySelectorAll('p')[9].innerText;
            var newDateString = ds.split('New Interview Date: ')[1];
            var newTimeString = ts.split('New Interview Time: ')[1];
            var newHour = newTimeString.split(':')[0];
            var newMinute = newTimeString.split(':')[1];
            // var newDate = new Date(Date.parse(newDateString));
            // newDate.setHours(newHour);
            // newDate.setMinutes(newMinute);

            // var desiredTimeStrings = [];
            var desiredTimeStrings = [
                 "8:00",  "8:15",  "8:30",  "8:45",  
                "17:00", "17:15", "17:30", "17:45",  
                "18:00", "18:15", "18:30", "18:45"];
            var isDesiredTime = desiredTimeStrings.indexOf(newTimeString) !== -1 || newDateString == "May 28, 2016";
            if (isDesiredTime) {
                console.log('Choosing new appointment on ' + newDateString + ' at ' + newTimeString);

                document.getElementById('comments').value = 'Found a sooner date';
                var confirmButton = document.querySelector('input.button[name=Confirm]');
                fireClick(confirmButton);
                console.log('got newer date!');
            } else {
                console.error('Found a sooner date ' + newDateString + ' but ' + newTimeString + ' was not a desired time');
            }
            window.callPhantom('report-interview-time', newDateString);
        });
    }
];

var i = 0;
interval = setInterval(function() {
    if (loadInProgress) { return; } // not ready yet...
    if (typeof steps[i] != "function") {
        //if (!readyToExit) { return; }
        return phantom.exit();
    }

    steps[i]();
    i++;

}, 100);

