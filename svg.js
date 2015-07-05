

function drawSVG() {
  // dump out some kind of SVG somewhere

// <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
// <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.0//EN" "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">
// <svg height="800" id="circlechart" width="1280" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
//   <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
// </svg>

  var xmlns = XmlService.getNamespace("http://www.w3.org/2000/svg");
  var mySVGroot = XmlService.createElement('svg', xmlns);
  

  mySVGroot
    .setAttribute("height", 800)
    .setAttribute("width", 1200)
//    .setAttribute("svg","http://www.w3.org/2000/svg", xmlns)
//    .setAttribute("xlink","http://www.w3.org/1999/xlink", xmlns)
  ;
  Logger.log("ohai, i did a mySVGroot: %s", mySVGroot);

  mySVGroot.addContent(
    XmlService.createElement("circle")
    .setAttribute("cx",50)
    .setAttribute("cy",50)
    .setAttribute("r",40)
    .setAttribute("stroke","green")
    .setAttribute("stroke-width",4)
    .setAttribute("fill","yellow")
    );

  // let's create the columns representing each shareholder in the cap table.
  // 

  var capTable = new capTable_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cap Table"));

  // each round gets a different color.
  // we want to draw a column for each shareholder.
  // going left to right, each shareholder gets a column for each round in which they invested …
  // 
  var allInvestors = capTable.allInvestors();
//[
//  {
//    "name": "Don Phan",
//    "rounds": [
//      {
//        "name": "founders – incorporation",
//        "price_per_share": 1,
//        "shares": 100,
//        "money": 100,
//        "percentage": 1
//      },
//      {
//        "name": "founders – vesting",
//        "price_per_share": 0.0001,
//        "shares": 32536,
//        "money": 3.2536,
//        "percentage": 0.4053219055212278
//      },

  // now let's draw some boxes

  var current_x = 50;
  var y_offset = 400;
  var x_spacing = 5;

  var max_price_per_share = 0;

  for (var investor_i in allInvestors) {
    var investor = allInvestors[investor_i];

    mySVGroot.addContent(XmlService.createComment("INVESTOR: " + investor.name));

    for (var round_i in investor.rounds) {
      var round = investor.rounds[round_i];
      if (! round.shares) { continue }

      var downround = max_price_per_share > round.price_per_share;
      if (!downround) max_price_per_share = round.price_per_share;

      mySVGroot.addContent(XmlService.createComment("INVESTOR: " + investor.name + " ROUND: " + round.name));

      // width represents number of shares
      // height represents price per share

      mySVGroot.addContent(
        XmlService.createElement("rect")
          .setAttribute("x",current_x)
          .setAttribute("y",y_offset-heightForPrice(round.price_per_share))
          .setAttribute("width",widthForShares(round.shares))
          .setAttribute("height",heightForPrice(round.price_per_share))
          .setAttribute("style","fill:blue") // todo: change the colour based on the round. but let's do that next.
        );         
        
        // in a down round, we draw a box above the real box showing the cheapness.
        if (downround) {
          mySVGroot.addContent(
            XmlService.createElement("rect")
              .setAttribute("x",current_x)
              .setAttribute("y",y_offset-heightForPrice(max_price_per_share-round.price_per_share))
              .setAttribute("width",widthForShares(round.shares))
              .setAttribute("height",heightForPrice(max_price_per_share-round.price_per_share))
              .setAttribute("style","fill:lightblue") // todo: change the colour based on the round. but let's do that next.
            );         
        }
        
       current_x += widthForShares(round.shares) + x_spacing;
     }
  }

  var folder = createFolder_(SpreadsheetApp.getActiveSheet());
  var document = XmlService.createDocument(mySVGroot);
  var xml = XmlService.getPrettyFormat().format(document);
  xml = xml.replace(/<svg xmlns=/, '<svg xmlns:svg="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns=')
           .replace(/xmlns="" /g, '');
  var svgfile = folder.createFile("mytest.svg", xml, 'image/svg+xml');
}

function widthForShares(num_shares) {
  return num_shares / 250;
}

function heightForPrice(price) {
  return price * 30;
}




