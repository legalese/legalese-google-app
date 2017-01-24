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
	this.echo("clicked");
    });
    this.wait(1000, function() {
	this.mouse.click(303, 495);
	this.mouse.click(755, 524);
    });
});

// repeat orders don't display the collect order button for some reason, so we navigate twice

casper.withFrame('top', function() {
    this.clickLabel('SEARCH MENU');
});

casper.withFrame('top', function() {
    this.clickLabel('COLLECT ORDERS');
});

casper.withFrame("main", function() {
    casper.withFrame('listFrame', function() {
	this.echo('can i see this');
 	this.click("a[class=OrderItem]");
 	this.echo('here');
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

	var info = initialInfo(keyArr, valArr);
	
	fs.write('results.json', JSON.stringify(info, null, 2), 'w');
	this.echo('done');
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
    for (var i = 0; i < keys.length; i++) {
	if (keys[i] == 'Capital Structure') {
	    break; 
	};
	result[keys[i]] = values[i];
    };

    result.capStructure = capStructure(keys, values);
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
