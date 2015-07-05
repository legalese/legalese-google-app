// ----------------------- code by Arjun and Lauren


// meng suggests: how about we start with an empty cap table, with just a single round in it, for incorporation.
// this could come from some Master tab in some existing spreadsheet, so we don't have to create the thing cell by cell.
// 
// TODO: let's devise a Round Object that helps to represent what's in a round.
// that round object could be created independent of a containing capTable.
// sure, the capTable object will create a bunch of Round objects when parsing an existing capTable.
// but when we want to add a new round to a capTable we can start by creating the Round and telling the capTable "here you go, deal with this".
//
// TODO: let's create an addRoundToCapTable method.
//
// TODO: let's create a createTabForRound method.
// 

function reset(){
  // meng suggests: we don't actually do anything with the next 3 lines. delete.
  var cap = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cap Table");
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(cap);
  parseCaptable(cap);

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet10");
  sheet.clear();
}

function createCaptable(captableRounds){
  reset();
  // meng suggests: grab a capTable_() object instead of just the parsed output.
  var capTable = parseCaptable();

//Find a blank sheet
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var sheet;
  for (var i = 0; i < sheets.length ; i++ ) {
//    Logger.log(sheets[i].getDataRange().getWidth());
    if (sheets[i].getDataRange().isBlank()){
      sheet = sheets[i]
      break;
    }
  };

  //If no blank sheet, create a new one
  if (!sheet){
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet();
  }

  //create sheet title: CAP TABLE
  var cell = sheet.getRange(1, 1);
  cell.setValue("CAP TABLE");

  //hardcode catagories
  var catagories = ["round name", 
                    "security type", 
                    "approximate date", 
                    "break it down for me", 
                    "pre-money", 
                    "price per share", 
                    "discount", 
                    "amount raised", 
                    "post"];
  
  // meng suggests: make this a method within the capTable_() object.
  var roundArray = getRoundArray(capTable);

  for (var i = 2; i< catagories.length + 2; i++){
    cell = sheet.getRange(i, 1);
	// meng suggests: set the formatting also.
    cell.setValue(catagories[i-2]);
    var roundNumber = 0;

    Logger.log(roundArray);
    var j = 2;
    Logger.log("roundArray.length is " + roundArray.length)
    while (roundNumber < roundArray.length){
      var dataCell = sheet.getRange(i, j);
      var category = cell.getValue();

      if (category == "break it down for me"){
        dataCell = sheet.getRange(i, j, 1, 3);
		// meng suggests: set the formatting also.
        dataCell.setValues([['money', 'shares', 'percentage']]);
      }
      if (category == "round name"){
        category = "name";
      }
      if (category == "amount raised"){
        j += 3;
        roundNumber++;
        continue;
      }

      Logger.log("round number is " + roundNumber);
      Logger.log("category is " + category);
      var dataCellValue = getCategoryData(capTable, roundNumber, category);

      if (!dataCellValue){}
      else if (dataCellValue.constructor == Object){
		// meng suggests: make these getters methods of the capTable_() object.
        var shares = getSharesValue(capTable, roundNumber, category) || "";
        var money = getMoneyValue(capTable, roundNumber, category) || "";
        var percentage = getPercentageValue(capTable, roundNumber, category) || "";
        dataCell = sheet.getRange(i, j, 1, 3);
		// meng suggests: set the formatting also.
        dataCell.setValues([[money, shares, percentage]]);
      }
      else{
        Logger.log("dataCell Value is " + dataCellValue);
        if (dataCellValue){
		  // meng suggests: set the formatting also.
          dataCell.setValue(dataCellValue);
        }
      }
      j += 3;
      roundNumber++;
    }
  }

  //input new investors
  // meng suggests: let's not hardcode Sheet10 -- let's get this passed in from outside.
  var sheetResult = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet10");
  // meng suggests: make these getters methods of the capTable_() object.
  var allInvestors = getNewInvestors(capTable, roundArray.length-1);
  var pivotRow = findCategoryRow(sheetResult, "amount raised");

  Logger.log("pivotRow is " + findCategoryRow(sheetResult, "amount raised"));
  Logger.log("allInvestors array has length: " + allInvestors.length);


  sheetResult.insertRowsBefore(pivotRow, allInvestors.length);
  Logger.log("new row for amount raised is " + findCategoryRow(sheetResult, "amount raised"));
  dataCell = sheet.getRange(pivotRow, 1, allInvestors.length);

  // meng suggests: use a different loop index variable ... var i was used above. some programming styles would prefer allInvestors_i so it's more obvious.
  for (var i = 0; i < allInvestors.length; i++){
    var cell = sheetResult.getRange(i+pivotRow, 1);
    cell.setValue(allInvestors[i]);
    Logger.log("the current investor is " + allInvestors[i]);

    roundNumber = 0;
    j = 2;
	// meng suggests:
	//    var col_offset = 2, col_size = 3;
	//    for (var major_col = 0; major_col < capTable.rounds().length; major_col++) {
	//      var actual_col = major_col * col_size + col_offset;
	//    ...
    while (roundNumber < roundArray.length){
      //check if new investors in round, because of short-circuit we can ask for investor in new_investors without error (neato!)

	  if ("new_investors" in capTable[roundNumber] &&
          allInvestors[i] in capTable[roundNumber]["new_investors"]) {

		// meng suggests: make these getters methods of the capTable_() object.
		// or even create a new Investor object.
        var shares = getNewInvestorMinorValue(capTable, roundNumber, allInvestors[i], "shares") || "";
        Logger.log("Shares for investor: " + shares);
        var money = getNewInvestorMinorValue(capTable, roundNumber, allInvestors[i], "money") || "";
        Logger.log("Money for investor: " + money);
        var percentage = getNewInvestorMinorValue(capTable, roundNumber, allInvestors[i], "percentage") || "";
        Logger.log("Percentage for investor: " + percentage);

		// meng suggests: see the col_offset / col_size discussion above.
        cell = sheetResult.getRange(i + pivotRow, j, 1, 3);//Note that we add 9 for proper offset, there should be a better way and not hardcode it. . .
		// meng suggests: add formatting here.
        cell.setValues([[money, shares, percentage]]);
      }
		// meng suggests: after implementing the col_offset / col_size discussion above, these lines below shouldn't be necessary.
      j+=3;
      roundNumber++;
  }
  }

  // meng suggests: maybe we need an object class for a captable sheet, which know show to do things like findCategoryRow().

  //calculate total
  var newAmountRaisedRow = findCategoryRow(sheetResult, "amount raised");
  var lastColumn = sheet.getLastColumn();
  Logger.log("THIS IS THE LAST COLUMN: %s", lastColumn);
  for (var i = 2; i <= lastColumn; i++){
    if ((i%3 == 0) || (i%3 == 2)){

      var range = newAmountRaisedRow - pivotRow;

      Logger.log("RANGE: %s; COLUMN: %s", range, i);
      var cell = sheetResult.getRange(newAmountRaisedRow, i);
      cell.setFormulaR1C1("=SUM(R[-" + range.toString() + "]C[0]:R[-1]C[0])");
    }
    else {
	  // meng suggests: add formatting here
      var cell1 = sheetResult.getRange(newAmountRaisedRow,   i-1).getValues();
      var cell2 = sheetResult.getRange(newAmountRaisedRow+1, i-1).getValues();
      var cell3 = sheetResult.getRange(newAmountRaisedRow,   i);
	  // meng suggests: can we make this a formula?
      cell3.setValue(cell1/cell2);
    }
  };

  // meng suggests: can we become a method of some more intelligent object class?
  var sharesPostRow = findCategoryRow(sheetResult, "shares, post");
  // meng suggests: maybe a different loop index variable?
  for (var i = 3; i<= lastColumn - 1; i+=3){
    var subTotalShares = sheetResult.getRange(sharesPostRow - 1, i).getValue();
    if ((i == 3) || (i== (lastColumn - 1))){
      var cell = sheetResult.getRange(sharesPostRow, i);
	  // meng suggests: can we make this a formula?
      cell.setValue(subTotalShares);
    }
    else {
      //var lastRoundShares = sheetResult.getRange(sharesPostRow, i-3);
      var cell = sheetResult.getRange(sharesPostRow, i);
      cell.setFormula("=ADD(R[0]C[-3], R[-1]C[0])");
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheetResult);


};

//upperRange = pivotRow
//lowerRange = findCategoryRow(sheetResult, "amount raised");
function getAmountRaised(sheet, upperRange, lowerRange, columnCell){
  //sum of all investor for money and shares
  Logger.log("dsfhsdkjfhdskjfhdsfdskjfhdsjkf");
  var range = lowerRange - upperRange;

  Logger.log("RANGE: " + range + "COLUMN: " + columnCell);
  var cell = sheet.getRange(lowerRange, columnCell);
  cell.setFormulaR1C1("=SUM(R[-" + range.toString() + "]C[0]:R[-1]C[0])");
}


function findCategoryRow(sheet, category) {
  var key = category;
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();


  for (var i = 0; i < values.length; i++) {
    if (values[i][0] == key){
      return i + 1;
    };
  }
}


//get functions for each catagory

//returns an array, given round number, gives round name
function getRoundArray(capTable){
  var roundToNumber = []
  //key starts at 0
  for (key in capTable){
    roundToNumber[key] = capTable[key]["name"];
  }
  return roundToNumber
}

//returns the round name, given round number
function getRoundName(capTable, roundNumber){
  var round = getRoundArray(capTable);
  var roundName = round[roundNumber];
  return roundName;
}

//returns a number, given round name, gives round number
function getRoundNumber(capTable, roundName){
  var round = getRoundArray(capTable);
  var roundNumber = round.indexOf(roundName);
  return roundNumber;
}

function getCategoryData(capTable, round, category){
  var key = asvar_(category);
  if (typeof round == "string"){
    var roundNum = getRoundNumber(capTable, round);
    return capTable[roundNum][key];
  }
  else{
    return capTable[round][key]
  }
}

function getNewInvestors(capTable, round){
  var key = asvar_("new investors");
  if (typeof round == "string"){
    round = getRoundNumber(capTable, round);
  }
  var newInvestors = []
  var i = 0;
  for (name in capTable[round][key]){
    newInvestors[i] = name;
    i++;
  }
  return newInvestors
}

function getNewInvestorMinorValue(capTable, round, investor, minor){
  var key = asvar_("new investors");
  //Logger.log("LLLLLLLLLL" + capTable[round][key][investor][minor]);
  if (typeof round == "string"){
    Logger.log("ITS THE FIRST ONE");
    var roundNum = getRoundNumber(capTable, round);
    if (minor in capTable[roundNum][key][investor]){
      return capTable[roundNum][key][investor][minor];
    }
    else { return ""};
  }
  else{
    Logger.log("ITS THE SECOND ONE");
    Logger.log("percentage" in capTable[round][key][investor]);
    if (minor in capTable[round][key][investor]){
      Logger.log("Do I exist?" + capTable[round][key][investor]);
      return capTable[round][key][investor][minor];
    }
    else { Logger.log("Do I exist?" + capTable[round][key][investor]); return ""};
  }
}

function getMoneyValue(capTable, round, catagory){
  var key = asvar_(catagory);
  if (typeof round == "string"){
    var roundNum = getRoundNumber(capTable, round);
    return capTable[roundNum][key]["money"];
  }
  else{
    return capTable[round][key]["money"];
  }
}

function getSharesValue(capTable, round, catagory){
    var key = asvar_(catagory);
  if (typeof round == "string"){
    var roundNum = getRoundNumber(capTable, round);
    return capTable[roundNum][key]["shares"];
  }
  else{
    return capTable[round][key]["shares"];
  }
}

function getPercentageValue(capTable, round, catagory){
    var key = asvar_(catagory);
  if (typeof round == "string"){
    var roundNum = getRoundNumber(capTable, round);
    return capTable[roundNum][key]["percentage"];
  }
  else{
    return capTable[round][key]["percentage"];
  }
}
