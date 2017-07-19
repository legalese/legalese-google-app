
var htmlparser = require("htmlparser2");

// this demonstrates structured extraction from an HTML parse tree.
// in this case we are using htmlparser2,
// but if you are operating within a Casper environment
// you should be able to just use .findAll() to grab the HTML element
// which will then offer up its internals to the appropriate extraction methods.

var rawHtml = "<tr><td class=\"DtaFld\" width=\"30%\" valign=\"top\">SHANE HUGH CREHAN<br><b><a class=\"searchlink\" href=\"Javascript:showhl('PT9763807;SHANE HUGH CREHAN','idno','');\">PT9763807</a></b></td><td class=\"DtaFld\" width=\"30%\" valign=\"top\">4 CHARNWOOD HEATH, CLONSILLA,<br>DUBLIN 15, IRELAND <br>-</td><td class=\"DtaFld\" width=\"15%\" valign=\"top\">IRISH</td><td class=\"DtaFld\" width=\"25%\" valign=\"top\">30/09/2015<br>DIRECTOR<br></td></tr>\"";
var domutils = require("domutils");
var handler = new htmlparser.DomHandler(function (error, dom) {
  if (error) { }
  else {
    // some more structured XPath selector might be nice, but this works.
    console.log(dom[0]
                .children[0]
                .children[0]
                .data);
    console.log(dom[0]
                .children[0]
                .children[2]
                .children[0]
                .children[0]
                .data);
  }
});
var parser = new htmlparser.Parser(handler);
parser.write(rawHtml);
parser.end();

