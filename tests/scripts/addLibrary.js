var casper = require('casper').create();

casper.options.viewportSize = {width: 1920, height: 1080};

var mouse = require("mouse").create(casper);
var fs = require('fs');

// left blank before selection of official test sheet; will be filled in with the attached script URL

casper.start('', function() {
    this.echo('at test sheet script editor');
});

// get email

casper.then(function() {
    this.sendKeys('input#Email', casper.cli.args[0]);
});

// get password

casper.then(function() {
    this.click('input#next');
    this.waitForSelector('#Passwd', function() {
	this.sendKeys('input#Passwd', casper.cli.args[1]);
	this.echo('pwd');
    });
});

// click signin

casper.then(function() {
    this.waitForSelector('#signIn', function() {
	this.click('input#signIn');
	this.echo('signin');
    });
});

// click resources/libraries

casper.then(function() {
    this.waitForSelector('div.gwt-Label.name', function() {
 	this.click('div#macros-resources-menu');
 	this.mouse.click(474, 80); // click 'Libraries...'
    });
});

// delete original legaleseMain

casper.then(function() {
    this.waitForSelector('div.maestro-dialog', function() {
 	this.echo('hi');
 	this.waitForSelector('input.gwt-TextBox.textbox', function() {
 	    this.mouse.click(1225, 385); // click delete
 	    this.mouse.click(697, 648); // click save
 	    this.echo('deleted orig lib');
 	});
    });
});

// click resources/libraries

casper.then(function() {
    this.waitForSelector('div.gwt-Label.name', function() {
	this.click('div#macros-resources-menu');
	this.mouse.click(474, 80); // click 'Libraries...'
    });
});

// add library to be tested

casper.then(function() {
    this.waitForSelector('div.maestro-dialog', function() {
	this.waitForSelector('input.gwt-TextBox.textbox', function() {
	    this.sendKeys('input.gwt-TextBox.textbox', casper.cli.args[2]), // get your library identifier from File/Manage Versions
	    this.click('button.gwt-Button.button');
	    this.waitForSelector('input.gwt-TextBox.identifier.item', function() {
		this.sendKeys('input.gwt-TextBox.identifier.item', 'legaleseMain', { reset: true });
		this.click('div.goog-button-base-content');
		this.waitForSelector('tr.version', function() {
		    this.mouse.click(861, 452); // click most recent library version - assumes that's the one to be tested
		    this.mouse.click(1136, 385); // toggle dev-mode
		    this.mouse.click(697, 648); // click save
		});
	    });
	});
    });
});



casper.run();
