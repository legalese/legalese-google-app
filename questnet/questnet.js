var casper = require('casper').create();
var mouse = require("mouse").create(casper);


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

casper.then(function() {
    this.capture('results.png');
    this.echo('ive just spent five dollars');
});

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

// assuming prepay, we redirect to collect orders page

casper.withFrame("top", function() {
    this.clickLabel("COLLECT ORDERS");
    this.waitForSelector("td[class=dptxtblue2bold]", function() {
 	this.echo("here");
    });
});

casper.withFrame("listFrame", function() {
    this.mouse.click("td[class=CF]"); // this should usually work as clicking on the most recent search
    // this.clickLabel("44751373"); // an example of order number contained in that selector
});

casper.withFrame("contentFrame", function() {
    this.waitForSelector("td[class=titleFont1]", function() {
 	this.echo("loaded");
    });
});

// scrape desired content

casper.withFrame("contentFrame", function() {
    var info = this.evaluate(function() {
 	var nodes = document.querySelectorAll("td[class=DtaFld]");
    });
    require('fs').write("results.json", JSON.stringify(info), "w"); // this is messy, will deal with it on the node side
});


casper.run();
