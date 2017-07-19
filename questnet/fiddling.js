
var casper = require('casper').create();
var mouse = require("mouse").create(casper);
var fs = require('fs');

// usage: casperjs fiddling.js file://localhost`pwd`/examples/facebook.html output.json

// navigate straight to relevant asp page

var startUrl = (casper.cli.args.length > 0)
	     ? casper.cli.args[0]
	     : 'https://www.questnet.sg/Maincontent.asp';

casper.start(startUrl, function() { // INSERT YOUR LOCAL FILE HERE
    this.echo(startUrl + " loaded");
});

casper.then(function() {

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
    var val = this.getElementsInfo('td.DtaFld');
    for (var i = 0; i < val.length; i++) {
	valArr.push(val[i].text);
    }

    this.echo('Getting details');
    var info = initialInfo(keyArr, htmlArr, nricArr);
    
    fs.write(casper.cli.args[1], JSON.stringify(info, null, 2), 'w');
    
    this.echo('Done!');
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

    var idReg = /[A-Za-z]\d{7}[A-za-z]|\d{9}[A-za-z]|[A-za-z]{2}\d{7}|\d{9}/; // matches ICs and UENs

    for (var i = 0; i < values.length; i++) {

	// does the previous cell have a date/is empty and does the next cell contain an IC or UEN? If so, this is the start of the director's block
	
	if (!(/[A-Za-z]/.test(values[i])) && idReg.test(values[i+1])) {
	    
	    for (var j = i + 1; j < values.length; j += 4) {
		if (values[j+3] == 'ORDINARY' || values[j+3] == 'PREFERENCE') {
		    break;
		};
		var newDirector = {
		    nameID: values[j].slice(0, /<br>/g.exec(values[j]).index),
		    id: ic[id],
		    address: values[j+1].slice(0, addresses(values[j+1])[2]),
		    nationality: values[j+2],
		    appointment: values[j+3].slice(10).replace(re, ' ') // cut off dates
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
	}
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
