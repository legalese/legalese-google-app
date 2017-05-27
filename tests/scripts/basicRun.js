var casper = require('casper').create();

casper.options.viewportSize = {width: 1920, height: 1080};

var mouse = require("mouse").create(casper);
var fs = require('fs');

// left blank before selection of official test sheet; will be filled in with the attached script URL

casper.start('', function() {
    this.echo('Navigated to test sheet script editor');
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
	this.echo('Entered password');
    });
});

// click signin

casper.then(function() {
    this.waitForSelector('#signIn', function() {
	this.click('input#signIn');
	this.echo('Signing in...');
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
 	this.waitForSelector('input.gwt-TextBox.textbox', function() {
 	    this.mouse.click(1225, 385); // click delete
 	    this.mouse.click(697, 648); // click save
 	    this.echo('Deleted original legaleseMain');
 	});
    });
});

// click resources/libraries

/*

why do we do close and reopen the modal? Because before saving changes, the previous library when deleted
is still stored in the modal as a hidden div, which makes it difficult for us to select the correct
text field (which has no id) to rename the library.

*/

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
		    this.echo('Added new test library');
		});
	    });
	});
    });
});

// generate pdfs

casper.thenOpen('https://docs.google.com/spreadsheets/d/1QNo9cuBUoJQqZdiKbEsFl4bZ1e-QMcAcNsmxM9MuCaY/edit#gid=790633300', function() {
    this.echo('Opening the test spreadsheet');
    this.waitForSelector('div#\\:35', function() {
	this.click('div#\\:35'); // seed round tab
	this.waitForSelector('div#docs-extensions-menu', function() {
	    this.click('div#docs-extensions-menu'); // addons menu
	    this.waitForSelector('div#M2vn1ETAPoOIrHOWyJkTVroD70ir8sWkZ', function() { // selector here will depend on test spreadsheet
		this.page.sendEvent("keypress", casper.page.event.key.Down);
		this.page.sendEvent("keypress", casper.page.event.key.Down);
		this.page.sendEvent("keypress", casper.page.event.key.Right);
		this.page.sendEvent("keypress", casper.page.event.key.Down);
		this.page.sendEvent("keypress", casper.page.event.key.Return); // we go konami-style here because click encourages strange behaviour
		this.echo('Clicked on generate PDFs');
	    });
	});
    });
});

// if this particular library has not been authorised yet

casper.then(function() {
    this.waitForSelector('button[name="continue"]', function then() {
	this.echo('This copy of Legalese hasn\'t been authorised yet - going through oauth');
	this.click('button[name="continue"]');
	casper.waitForPopup(0, function() {
	    casper.withPopup(0, function() {
		this.echo(this.getCurrentUrl());
		this.waitForSelector('p.wpW1cb', function() {
		    this.click('p.wpW1cb');
		    this.echo('Selected email');
		    this.waitForSelector('div#submit_approve_access', function() {
			this.clickLabel('Allow');
			this.echo('Clicked allow');
		    });
		});
	    });
	});
    }, function timeout() {
	this.echo('This copy of Legalese has been authorised - going to the next step');
    });
});

// go to drive

casper.thenOpen('https://drive.google.com', function() {
    this.mouse.doubleclick('div[aria-label="Legalese Root"]');
    this.echo('Went to Drive, opening Legalese Root');
});

// go to latest generated folder

casper.then(function() {
    this.wait(3000, function() {
	this.mouse.doubleclick(495, 201); // assumes latest folder is test target
	this.echo('Opening Legalese output');
    });
});

// find xml

casper.then(function() {
    this.waitForSelector('img[src="//ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_text_x32.png"]', function() { // drive uses this icon for XML
	this.echo('Hooray, nothing broke');
    }, function timeout() {
	this.echo('No XML has been produced - something\'s not working');
    });
});

casper.run();
