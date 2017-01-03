var casper = require('casper').create();
var mouse = require("mouse").create(casper);
var fs = require('fs');

// navigate straight to relevant asp page

casper.start('https://www.questnet.sg/Maincontent.asp', function() {
    this.echo("loaded");
});

// select form and input login details

casper.then(function() {
    casper.waitForSelector("form input[name='txtUserID']", function() {
	this.fillSelectors('form', {
            'input[name = txtUserID ]' : casper.cli.args[0],
            'input[name = txtPassword ]' : casper.cli.args[1]
	}, true);
	this.echo("ive filled in the fields");
    });
});

// click login button

casper.then(function() {
    this.mouse.click("form input[value=LOGIN]");
    this.echo("clicked");

});

// remove maintenance popup

casper.then(function() {
    this.mouse.click(100, 500);
    this.echo("removed overlay");
});

// switch to child frame. frame focus only lasts in scope

casper.withFrame("main", function() {
    if (this.exists("td.searchLink1")) {
	this.echo("im in the right frame");
    }
    this.clickLabel("search");
});

// input search term

casper.withFrame("main", function() {
    this.sendKeys("input[class = uiCompanyRegno]", casper.cli.args[2]); // this should be changed to UEN soon because we don't to retrieve all string matches and pay for each retrieval
    this.mouse.click(250, 425);
    this.echo("i have clicked");
    // can't access the frame, have to wait the dumb way
    this.wait(1000, function() {
	this.mouse.click(496, 251);
	this.page.sendEvent("keypress", casper.page.event.key.Enter);
	this.echo("done");
    });
    this.wait(1000, function() {
	this.mouse.click(303, 495);
	this.mouse.click(750, 560); // this is for mastercard; after submitting request to finance channel should be able to click on the prepay option
 });
});

// nets payment is unfeasible because of 2FA, but included here for completeness.

/*
casper.then(function() {
    this.sendKeys('input[name=name]', 'name');
    this.sendKeys('input[name=cardNo]', 'card number');
    this.sendKeys('input[name=cvv]', 'cvv');
    this.evaluate(function() {
        document.querySelector('select[name=expiryMonth]').selectedIndex = 1; // numerical value of the month of expiry
    });
    this.sendKeys('input[name=expiryYear]', 'year of expiry');
    this.click('input[name=agree]');
    // this sends for payment, so commented out
    // this.click('input#submit');
});
*/

// sometimes search has been made in the last 5 days; questnet will redirect to currently existing order to avoid repayment

/*
casper.withFrame("main", function() {
    this.echo(this.getCurrentUrl());
    this.mouse.click(152, 318);
});

casper.wait(2000, function() {
    this.capture("search.png");
});
*/

casper.withFrame('top', function() {
    this.clickLabel("COLLECT ORDERS");
    this.echo('hello');
});

casper.withFrame("main", function() {
    casper.withFrame('listFrame', function() {
	this.click("a[class=OrderItem]");
	this.echo('here');
    });
});

casper.withFrame('main', function() {
    casper.withFrame('contentFrame', function() {
	fs.write('result.html', this.getHTML(), 'w');
    }); // imma write the parser now
    this.echo('done');
});


casper.run();
