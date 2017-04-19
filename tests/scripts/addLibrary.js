var casper = require('casper').create();

casper.options.viewportSize = {width: 1920, height: 1080};

var mouse = require("mouse").create(casper);
var fs = require('fs');

casper.start('https://script.google.com/macros/d/M2vn1ETAPoOIrHOWyJkTVroD70ir8sWkZ/edit?uiv=2&mid=ACjPJvGZMNGWqRO5TqKrVU8COn2KacXWK814Tsx23VQzMQw4tYlfXdmGJI3GTogzzivms4V4US8I0UbKP0tSRcD1iTHffy6wDQE5U06dwQ6A3mliOdV_BJoMsOVnkfrFydLd58m9Ho0k2gQ', function() {
    this.echo('at test sheet script editor');
});

casper.then(function() {
    this.sendKeys('input#Email', '');
});

casper.then(function() {
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
    this.waitForSelector('div.gwt-Label.name', function() {
	this.click('div#macros-resources-menu');
    });
});

casper.then(function() {
    this.click('div#\\:1q');
    this.echo('clicked');
    this.sendKeys('input.gwt-TextBox.textbox', 'MBFocfLAJmuH5tvP1xdfvRaQ2d-IWEG6q');
    this.click('button.gwt-Button.button');
    this.capture('sheet.png');
});

casper.run();
