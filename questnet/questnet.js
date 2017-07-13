var casper = require('casper').create();
var mouse = require("mouse").create(casper);
var fs = require('fs');

// navigate straight to relevant asp page

casper.start('https://www.questnet.sg/Maincontent.asp', function() {
    this.echo("Main page loaded");
});

// select form and input login details

casper.then(function() {
    casper.waitForSelector("form input[name='txtUserID']", function() {
	this.fillSelectors('form', {
            'input[name = txtUserID ]' : casper.cli.args[0],
            'input[name = txtPassword ]' : casper.cli.args[1]
	}, true);
	this.echo("Login details filled");
    });
});

// click login button

casper.then(function() {
    this.mouse.click("form input[value=LOGIN]");
    this.echo("Logging in...");

});

casper.then(function() {
    this.mouse.click(100, 500);
    this.echo("Removed maintenance overlay");
});

// switch to child frame. frame focus only lasts in scope

casper.withFrame("main", function() {
    if (this.exists("td.searchLink1")) {
	this.echo("Checking for the right frame");
    }
    this.clickLabel("search");
});

// input search term

casper.withFrame("main", function() {
    this.sendKeys("input[class = uiCompanyRegno]", casper.cli.args[2]);
    this.mouse.click(250, 425);
    this.echo("Search submitted");
    // can't access the frame, have to wait the dumb way
    this.wait(1000, function() {
	this.mouse.click(496, 251);
	this.page.sendEvent("keypress", casper.page.event.key.Enter);
	this.echo("Result selected");
    });
    this.wait(1000, function() {
	this.mouse.click(303, 495);
	this.mouse.click(755, 524);
	casper.waitForAlert(function then() {
	    this.die('Search has returned no results! Exiting script.')
	}, function timeout() {
	    this.echo('Search has returned 1 or more relevant results. Selected.');
	});
    });
    
});

// repeat orders don't display the collect order button for some reason, so we navigate twice

casper.withFrame('top', function() {
    this.page.sendEvent('keypress', casper.page.event.key.Enter);
    this.clickLabel('SEARCH MENU');
});

casper.withFrame('top', function() {
    this.clickLabel('COLLECT ORDERS');
});

casper.withFrame("main", function() {
    casper.withFrame('listFrame', function() {
 	this.click("a[class=OrderItem]");
 	this.echo('Clicked on order item');
    });
});

casper.withFrame('main', function() {
    casper.withFrame('contentFrame', function() {

	// make dom elements available to casperjs
	
	var keyArr = [];
	var valArr = [];	
	
	var elements = this.getElementsInfo('td.lblFld');
	for (var i = 0; i < elements.length; i++) {
	    elements[i].text = elements[i].text.replace(/[\n\t:]/g, '').trim();
	    keyArr.push(elements[i].text);
	}
	var val = this.getElementsInfo('td.DtaFld');
	for (var i = 0; i < val.length; i++) {
	    val[i].text = val[i].text.replace(/[\n\t]/g, '');
	    valArr.push(val[i].text);
	}

	this.echo('Getting details');
	var info = initialInfo(keyArr, valArr);
	
	fs.write('results.json', JSON.stringify(info, null, 2), 'w');
	this.echo('Done!');
    });
});

casper.withFrame('main', function() {
    casper.withFrame('contentFrame', function() {
	fs.write('results.html', this.getHTML(), 'w');
    });
});

casper.run();


// parser constructor functions

function initialInfo(keys, values) {
    var result = {};

    // we get the initial general information first

    for (var i = 0; i < keys.length; i++) {
	if (keys[i] == 'Capital Structure') {
	    break; 
	};
	result[keys[i]] = values[i];
    };

    result.capStructure = capStructure(keys, values);
    result.directors = getDirectors(values);
    result.shareholders = getShareholders(values);
    return result;
};

function capStructure(keys, values) {
    for (var i = 0; i < keys.length; i++) {
	if (keys[i] == 'Capital Structure') {
	    var shares = {
		issuedOrdinary: {
		    shares: values[i+1],
		    currency: values[i+2],
		    value: '$' + values[i+3]
		},
		paidUpOrdinary: {
		    shares: values[i+5],
		    currency: values[i+6],
		    value: '$' + values[i+7]
		}
	    }
	}
    }
    return shares;
}

// directors have four table fields

function getDirectors(values) {
    var directors = [];
    var idReg = /[A-Za-z]\d{7}[A-za-z]|\d{9}[A-za-z]/; // matches ICs and UENs
    var countryReg = /singapore|united states|malaysia/i; // as needed
    var postalReg = /\d{6}/; // postal codes
    
    for (var i = 0; i < values.length; i++) {

	// does the previous cell have a date/is empty and does the next cell contain an IC or UEN? If so, this is the start of the director's block
	
	if (!(/[A-Za-z]/.test(values[i])) && idReg.test(values[i+1])) {
	    
	    for (var j = i + 1; j < values.length; j += 4) {
		if (values[j+3] == 'ORDINARY' || values[j+3] == 'PREFERENCE') {
		    break;
		};
		var id = idReg.exec(values[j]);
		var country = countryReg.exec(values[j+1]);
		var postal = postalReg.exec(values[j+1]);
		var newDirector = {
		    nameID: values[j].slice(0, id.index),
		    id: values[j].slice(id.index),
		    address: values[j+1].slice(0, country.index).replace('#', ' #'),
		    postalCode: values[j+1].slice(country.index, postal.index + 6), // cut off dates
		    nationality: values[j+2],
		    appointment: values[j+3].slice(10) // cut off dates
		};
		directors.push(newDirector);
	    }
	}
    }
    return directors;
}

// shareholders have six table cells

function getShareholders(values) {
    var shareholders = [];
    var idReg = /[A-Za-z]\d{7}[A-za-z]|\d{9}[A-za-z]/;
    var countryReg = /singapore|united states|malaysia/i;
    var postalReg = /\d{6}/;
    
    for (var i = 0; i < values.length; i++) {

	// check start and end of shareholder block

	if (values[i+3] == 'ORDINARY' || values[i+3] == 'PREFERENCE') {
	    
	    for (var j = i; j < values.length; j += 6) {
		if (values[j+3] == undefined) {
		    break;
		};

		var id = idReg.exec(values[j]);
		var country = countryReg.exec(values[j+2]);
		var postal = postalReg.exec(values[j+2]);
		
		var newShareholder = {
		    nameID: values[j].slice(0, id.index),
		    id: values[j].slice(id.index),
		    nationality: values[j+1],
		    address: values[j+2].slice(0, country.index).replace('#', ' #'),
		    postalCode: values[j+2].slice(country.index, postal.index + 6),
		    sharetype: values[j+3],
		    sharenumber: values[j+4],
		    currency: values[j+5]
		}
		shareholders.push(newShareholder);
	    }
	    break;
	}
    }
    return shareholders;
}
