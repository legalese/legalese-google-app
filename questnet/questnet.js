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
            'input[name = txtUserID ]' : 'legalese',
            'input[name = txtPassword ]' : 'Pang0lin'
	}, true);
	this.echo("ive filled in the fields");
    });
});

// click login button

casper.then(function() {
    this.mouse.click("form input[value=LOGIN]");
    this.echo("clicked");

});

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
    this.sendKeys("input[class = uiCompanyRegno]", '199703805H'); 
    this.mouse.click(250, 425);
    this.echo("i have clicked");
    // can't access the frame, have to wait the dumb way
    this.wait(1000, function() {
	this.mouse.click(496, 251);
	this.page.sendEvent("keypress", casper.page.event.key.Enter);
	this.echo("clicked");
    });
    this.wait(1000, function() {
	this.mouse.click(303, 495);
	this.mouse.click(755, 524);
    });
});

// navigate to orders page

casper.withFrame('top', function() {
    this.clickLabel("COLLECT ORDERS");
    this.echo('hello');
});

// sometimes there's a warning that i'm already logged in

casper.then(function() {
    this.page.sendEvent('keypress', casper.page.event.key.Enter);
});

// click on current order

casper.withFrame("main", function() {
    casper.withFrame('listFrame', function() {
 	this.click("a[class=OrderItem]");
 	this.echo('here');
    });
});

// parse html to json, write to file. integrated with v2 later i think this will be an insert to pgsql or something similar

casper.withFrame('main', function() {
    casper.withFrame('contentFrame', function() {
	var keyArr = [];
	var valArr = [];
	var elements = this.getElementsInfo('td.lblFld');
	for (var i = 0; i < elements.length; i++) {
	    keyArr.push(elements[i].text);
	}
	var val = this.getElementsInfo('td.DtaFld');
	for (var i = 0; i < val.length; i++) {
	    valArr.push(val[i].text);
	}
	function results(keys, values) {
	    var result = {};
	    for (var i = 0; i < 20; i++) { //until status date
		keys[i] = keys[i].replace(/:/g, '').trim();
		result[keys[i]] = values[i].replace(/[\n\t]/g, '');
	    }
	    return result;
	};
	var info = results(keyArr, valArr);
	fs.write('results.json', JSON.stringify(info), 'w');
    });
});

casper.run();
