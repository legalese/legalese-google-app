var casper = require('casper').create();
var mouse = require("mouse").create(casper);
var fs = require('fs');

var start = Date.now();

// navigate straight to relevant asp page

casper.start('https://www.questnet.sg/Maincontent.asp', function() {
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
    this.mouse.click(100, 200);
    this.echo("Removed maintenance overlay");
});

// switch to child frame. frame focus only lasts in scope

casper.withFrame("main", function() {
    this.clickLabel("search");
});

// input search term

casper.withFrame("main", function() {
    this.sendKeys("input[class = uiCompanyRegno]", casper.cli.args[2]);
    this.clickLabel('Browse');
    this.echo('Search submitted');
});

// whole bunch of callbacks because all these elements are loaded by js

casper.withFrame('main', function() {
    this.waitForSelector('div.content', function() {
	this.waitForSelector('iframe.GB_frame', function() {
	    casper.withFrame('GB_frame', function() {
		this.waitForSelector('iframe#GB_frame', function() {
		    casper.withFrame(0, function() {
			this.waitForSelector('select#lstIDName', function() { // actual form
			    this.evaluate(function() {
				document.querySelector('select#lstIDName').selectedIndex = 0; // assume only 1 result of search by uen
			    });
			    this.click('td.button_bluesmall > img:first-child');
			    this.echo('Result selected');
			});
		    });
		});
	    });
	});
    });
});

casper.withFrame('main', function() {
    this.click('a#IdSubmit'); // point button
    this.echo('Clicked pay');
});

// repeat orders don't display the collect order button for some reason, so we navigate twice

casper.withFrame('top', function() {
    this.page.sendEvent('keypress', casper.page.event.key.Enter);
    this.clickLabel('SEARCH MENU');
});

casper.withFrame('top', function() {
    this.clickLabel('COLLECT ORDERS');
});

// search for the correct order item from the UEN entered previously

casper.withFrame("main", function() {
    casper.withFrame('listFrame', function() {
	var re = new RegExp(casper.cli.args[2], 'gi');
	var htmlArr = this.getElementsInfo('td.CF').map(function(e) { return e.html } );
	for (var i = 0; i < htmlArr.length; i++) {
	    if (re.test(htmlArr[i])) {
		var labelLength = htmlArr[i-1].length; // cell with order item link is one cell before cell containing the name/uen of search result
		var label = htmlArr[i-1].slice(labelLength - 12, labelLength - 4); // get order no.
		this.echo('Found the correct order item');
		this.clickLabel(label);
		this.echo('Clicked on the order item');
	    }
	}
    });
});

casper.withFrame('main', function() {
    casper.withFrame('contentFrame', function() {

	// make dom elements available to casperjs
	
	var keyArr = [];
	var valArr = [];	
	var htmlArr = this.getElementsInfo('td.DtaFld').map(function(e) { return e.html } );
	var nricArr = this.evaluate(function() {
	    var elements = __utils__.findAll('td.DtaFld a.searchlink');
	    return elements.map(function(e) {
		return e.text;
	    });
	});
	
	var elements = this.getElementsInfo('td.lblFld');
	for (var i = 0; i < elements.length; i++) {
	    keyArr.push(elements[i].text);
	}
	
	this.echo('Getting details');
	var info = initialInfo(keyArr, htmlArr, nricArr);
	
	fs.write('results.json', JSON.stringify(info, null, 2), 'w');
	
	this.echo('Done!');
	this.echo(Date.now() - start);
    });
});

casper.run();


// parser constructor functions

function initialInfo(keys, values, ic) {
    
    var result = {};

    var htmlId = 1; // counter for the ID <a.searchlink> array
    
    // we get the initial general information first

    for (var i = 0; i < keys.length; i++) {
	if (keys[i] == 'Capital Structure:') {
	    break;
	};
	if (i == 3) {
	    result[keys[i]] = ic[0]; // company UEN from the ID array
	    continue;
	}
	result[keys[i]] = values[i].replace(/\t/g, '')
    };

    result.capStructure = capStructure(keys, values);
    result.directors = getDirectors(values, ic, htmlId);
    result.shareholders = getShareholders(values, ic, htmlId);
    result.complianceRecord = getRecords(values);
    return result;
};

function capStructure(keys, values) {
    for (var i = 0; i < keys.length; i++) {
	if (keys[i] == 'Capital Structure:') {
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


function getDirectors(values, ic, id) {
    var directors = [];

    var uenReg = new RegExp(casper.cli.args[2], 'gi');
    for (var i = 0; i < values.length; i++) {

	// conditions for start of director block:
	// has a.searchlink
	// next value is not empty
	// no mention of shares or empty shareholder block
	
	if (/searchlink/.test(values[i]) && values[i+1].length > 0 && !(values[j+3] == 'ORDINARY' || values[j+3] == 'PREFERENCE' || values[j] == 'PLEASE REFER TO DOCUMENTARY RECORDS FOR INFORMATION')) {
	    for (var j = i; j < values.length; j += 4) {
		if (values[j+3] == 'ORDINARY' || values[j+3] == 'PREFERENCE' || values[j] == 'PLEASE REFER TO DOCUMENTARY RECORDS FOR INFORMATION') {
		    break;
		};
		var newDirector = {
		    nameID: values[j].slice(0, /<br>/g.exec(values[j]).index),
		    id: ic[id],
		    address: values[j+1].slice(0, addresses(values[j+1])[2]),
		    nationality: values[j+2],
		    appointment: values[j+3].slice(10).replace(/<br>/g, ' ') // cut off dates
		};
		directors.push(newDirector);
		id++;
	    }
	}
    }
    return directors;
}

// shareholders have six table cells

function getShareholders(values, ic, id) {
    
    var shareholders = [];

    for (var i = 0; i < values.length; i++) {

	// check start and end of shareholder block

	if (values[i+3] == 'ORDINARY' || values[i+3] == 'PREFERENCE') {
	    
	    for (var j = i; j < values.length; j += 6) {
		if (values[j+3] == undefined) {
		    break;
		}
		var newShareholder = {
		    nameID: values[j].slice(0, /<br>/g.exec(values[j]).index),
		    id: ic[id],
		    nationality: values[j+1],
		    address: values[j+2].slice(0, addresses(values[j+2])[2]).replace(/\n\t\t\t\t\t\t\t\t\t\t\t\t\t/g, ''),
		    sharetype: values[j+3],
		    sharenumber: values[j+4],
		    currency: values[j+5]
		}
		shareholders.push(newShareholder);
		id++;
	    }
	    break;
	} else if (values[i] == 'PLEASE REFER TO DOCUMENTARY RECORDS FOR INFORMATION') {
	    var newShareholder = {
		data: 'PLEASE REFER TO DOCUMENTARY RECORDS FOR INFORMATION'
	    }
	    shareholders.push(newShareholder);
	};
    }
    return shareholders;
}

// cut addresses

function addresses(addressField) {
    var re = /<br>/g;
    var match, indexes = [];
    while ((match = re.exec(addressField)) != null) {
	indexes.push(match.index);
    };
    return indexes;
}

function getRecords(values) {
    var records = {
	lastAgm: values[values.length - 3],
	lastAr: values[values.length - 2],
	acLastAgm: values[values.length - 1]
    };
    return records;
}
