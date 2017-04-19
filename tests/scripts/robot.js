var casper = require('casper').create();

casper.options.viewportSize = {width: 1920, height: 1080};

var mouse = require("mouse").create(casper);
var fs = require('fs');

casper.start('https://docs.google.com/spreadsheets/d/1rBuKOWSqRE7QgKgF6uVWR9www4LoLho4UjOCHPQplhw/copy?id=1rBuKOWSqRE7QgKgF6uVWR9www4LoLho4UjOCHPQplhw&copyCollaborators=false&copyComments=false&title=My%20Legalese%20Tutorial%202&usp=sheets_web', function() {
    this.echo('started');
})

casper.then(function() {
    this.sendKeys('input#Email', '');
});

casper.then(function() {
    if (this.exists('input#next')) {
	this.echo('yay');
    };
    this.click('input#next');
    this.waitForSelector('#Passwd', function() {
	this.sendKeys('input#Passwd', '');
	this.echo('pwd');
    });
});

casper.then(function() {
    this.waitForSelector('#signIn', function() {
	this.click('input#signIn');
	this.echo('signin');
    });
});

casper.then(function() {
    this.click('#confirmActionButton');
    this.echo('done');
    this.open('https://drive.google.com', function() {
	this.echo('now at drive');
    });
});

casper.then(function() {
    this.wait(5000, function() {
	this.clickLabel('My Legalese Tutorial 2 Google Sheets');
	this.page.sendEvent('keypress', casper.page.event.key.Enter);
    });
});

casper.then(function() {
    this.capture('sheet.png');
    this.echo('at sheet');
});

casper.run();
