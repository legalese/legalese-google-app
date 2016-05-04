

// read the hand-coded dependencies sheet and output a simple JSON list of nodes and links suitable for consumption by d3.layout.force().
// in future, we can take a list of nodes and links produced by the main dependencies.js and either output it to the spreadsheet view as an intermediate step
// or produce a node/links layout directly.

function readDepSheet(){
  var sheet = SpreadsheetApp.getActiveSheet();
  var mydepSheet = new depSheet();
  mydepSheet.read(sheet);
}

function depWriteForceLayout() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var mydepSheet = new depSheet();
  mydepSheet.read(sheet);
  mydepSheet.layout_force();
}

function depSheet() {
  // we internally maintain a list of vertices and edges.
  this.vertex = []; // { type=BLANK|SUBSECTION|PDF|PARTY, title=String, URL=String, templatename=String, state=(done|waived|optional|pending|unready) }
  this.edge   = []; // { source=vertex_id, target=vertex_id } // for a Target to be considered done, all its Sources must be done, waived, or optional

  // parsed spreadsheet cells
  this.cell = []; // cell[y][x] = VertexIndex
  // type VertexIndex = Int
  
  // later, we export to a list of nodes and links suitable for consumption by d3.
  this.d3 = { nodes: [], links: [] };
}

depSheet.prototype.read = function(sheet) {
  this.sheet = sheet;
  this.sheetName = sheet.getSheetName();

  // sheet nodes are given by rows which begin with the word DEPENDENCIES
  // the name is the second word to appear in the row, no matter what cell it's on.
  //
  // PDF nodes are given by a pattern match:    [BLANK] [BLANK]
  //                                            [BLANK] [PDF  ]
  // 
  // Party nodes are given by a pattern match:  [PDF  ] [BLANK]
  //                                            [BLANK] [PARTY]
  //                                            
  // or an alternative pattern match            [BLANK] [PARTY]
  //                                            [BLANK] [PARTY]
  // 
  // so we basically parse the entire sheet cell by cell building up the lists of .vertices and .edges as we go.
  // it is possible to parse left-to-right, top-to-bottom.
  //

  var rows = sheet.getDataRange();
  var numRows  = rows.getNumRows(); this.numRows = numRows;
  var values   = rows.getValues();
  var formulas = rows.getFormulas();
  var formats  = rows.getNumberFormats();
  var display  = rows.getDisplayValues();

  var section = "";
  var currentsubsection = "";
  var currentsubsectionvertex = undefined;
  
  for (var i = 0; i <= numRows - 1; i++) {
    var row = values[i];
	this.cell[i] = this.cell[i] || [];
	// process header rows
	if (row.filter(function(c){return c.length > 0}).length == 0) { deLog("row %s is blank, skipping", i);  continue; }
	else 	if (row[0]) deLog(["row %s: processing row %s",i+1,row.slice(0,1)],8);

	// we have a new sheet subsection
    if      (row[0] == "DEPENDENCIES") {
	  section=row[0];
	  var words = row.slice(1).filter(function(e){return (e != undefined && e.length)});
	  currentsubsection = words.shift();
	  deLog(["matched DEPENDENCIES subsection: %s", currentsubsection],8);

	  var vertex = {type:"subsection", subsection:currentsubsection, title:currentsubsection, cell:[i,0], endrow:numRows};

	  if (words.length && words[0] == "requires") {
		words.shift();
		deLog(["    requires %s", words],8);
		vertex.requiresSubsections = words;
	  }
	  
	  this.cell[i][0] = this.vertex.length;
	  if (currentsubsectionvertex) { currentsubsectionvertex.endrow = i-1 }
	  this.vertex.push(vertex);
	  currentsubsectionvertex = vertex;
	  continue;
	}
    else if (row[0] == "DEP NODES") {
	  section=row[0];
	  if (currentsubsectionvertex) { currentsubsectionvertex.endrow = i-1 }
	}

	// main processing, section-dependent
	if (section == "DEPENDENCIES") {
	  for (var j = 0; j < row.length; j++) {
		if (j == 0) continue;
		if (values[i][j]) { deLog(["looking at cell %s,%s: %s", i, j, values[i][j]],9); }

		var vertex = undefined;
		// match PDF cell
		if (values[i][j] && ! values[i-1][j-1] && ! values[i-1][j] && ! values[i][j-1]) {
		  deLog(["matched PDF cell: %s", display[i][j]], 9);
		  // todo: add URL, colour etc
		  vertex = {type:"pdf", subsection:currentsubsection, title:display[i][j], cell:[i,j]};
		}

		// match Party cell
		else if (values[i][j] && ! values[i][j-1] &&
				 ((this.vertex[this.cell[i-1][j-1]] && this.vertex[this.cell[i-1][j-1]].type == "pdf")
				  ||
				  (this.vertex[this.cell[i-1][j]] &&this.vertex[this.cell[i-1][j]].type == "party"))) {
		  deLog(["matched Party cell: %s", display[i][j]], 9);
		  vertex = {type:"party", subsection:currentsubsection, title:display[i][j], cell:[i,j]};
		}

		if (vertex) {
		  this.cell[i][j] = this.vertex.length; // order matters here -- the index is one-off from the length
		  this.vertex.push(vertex);
		}
	  }
	}
  }
  deLog(["first pass complete; read %s subsections, %s pdfs, and %s party vertices",
		 this.vertex.filter(function(v){return (v.type == "subsection")}).length,
		 this.vertex.filter(function(v){return (v.type == "pdf")  }).length,
		 this.vertex.filter(function(v){return (v.type == "party")}).length],8);

  // completed first pass over the entire sheet, and built up .vertex and .cell.
  // now we run a second pass over .cell, inferring edges based on position.
  //
  // the edge rules are:
  // a subsection may require one or more other subsections.
  // a given edge defines a source and a target. a source is a prerequisite to a target.
  // an edge may take one of the following types:
  //   SOURCE      ->   TARGET
  //    subsection      ->    subsection
  //    pdf        ->    subsection
  //    pdf        ->    pdf
  //    party      ->    pdf
  // a subsection-subsection edge is determined by the DEPENDENCIES subsection line. all the sources for a subsection are named after the "requires" keyword.
  // a   pdf-subsection edge is given by all the final targets for a subsection.
  //                    a final targetis a vertex which is not a source to any other vertex.
  // a   pdf-pdf   edge is given by a spatial relationship within the section:
  //                    the PDF sources for a given PDF target cell are all the pdfs listed in the first column to the left that contains any pdf vertices.
  // a party-pdf   edge is given by a spatial relationship within the section:
  //                    the Party targets for a given source PDF cell are all the parties listed one column to the right and contiguously down

  this.findEdges_party_pdf();
  this.findEdges_pdf_pdf();
  this.findEdges_subsection_subsection();
  this.findEdges_pdf_subsection();

  
  // dependency status rules:
  //
  // for a subsection to be complete, all the subsection's final targets must be complete.
  // for a vertex to be complete, all the vertex's sources must be complete.
  // if a vertex has no sources, then, to be complete, it has to be coloured green -- it's probably a party source.

  // how do we distinguish between unready and pending vs waiting, etc?
};

depSheet.prototype.findEdges_subsection_subsection = function() {
  var self = this;

  for (var v = 0; v < this.vertex.length; v++) {
	var vertex = this.vertex[v];
	if (vertex.type == "subsection") {
	  if (vertex.requiresSubsections) {
		for (var rsi = 0; rsi < vertex.requiresSubsections.length; rsi++) {
		  var sourceSubsection = this.getSubsectionVertex(vertex.requiresSubsections[rsi]);
		  if (! sourceSubsection) {
			deLog(["!!! subsection->subsection subsection %s requires %s but no subsection by that name is known!", vertex.title, vertex.requiresSubsections[rsi]],5);
		  }
		  else {
			deLog(["  learned subsection-subsection edge %s -> %s (%s -> %s)", self.vertex.indexOf(sourceSubsection), v, sourceSubsection.title, vertex.title], 8);
			self.edge.push([self.vertex.indexOf(sourceSubsection), v]);
		  }
		}
	  }
	}
  }
};

  // a   pdf-subsection edge is given by all the final targets for a subsection.
  //                    a final target is a vertex which is not a source to any other vertex.
depSheet.prototype.findEdges_pdf_subsection = function() {
  var self = this;

  var subsectionVertices = this.vertex.filter(function(f){return (f.type == "subsection")});

  deLog(["pdf_subsection: preparing to extract final targets of subsections %s", subsectionVertices.map(function(vertex){return vertex.title})],8);
  
  for (var vi = 0; vi < subsectionVertices.length; vi++) {
	var subsection = subsectionVertices[vi].title;
	var vertexesInSubsection = this.getVertexesInSubsection(subsection);
	deLog(["pdf_subsection: examining %s vertices in subsection %s", vertexesInSubsection.length, subsection], 8);
	
	var finalTargets = vertexesInSubsection.filter(function(vertex){
	  return (self.targetsFor(self.vertexId(vertex)).length == 0);
	});

	for (var fti = 0; fti < finalTargets.length; fti++) {
	  var ft = finalTargets[fti];
	  deLog(["  learned pdf-subsection edge %s -> %s (%s -> %s)", self.vertexId(ft), self.vertex.indexOf(subsectionVertices[vi]), ft.title, subsection], 8);
	  self.edge.push([self.vertexId(ft), self.vertex.indexOf(subsectionVertices[vi])]);
	}
  }
};

depSheet.prototype.sourcesFor = function(v) {
  return this.edge.filter(function(e){return e[1] == v});
}
  
depSheet.prototype.targetsFor = function(v) {
  return this.edge.filter(function(e){return e[0] == v});
}

depSheet.prototype.vertexId = function(vertex) {
  return this.vertex.indexOf(vertex);
}

depSheet.prototype.getSubsectionVertex = function(title) {
  return this.vertex.filter(function(v){ return (v.type == "subsection" && v.title == title) })[0];
};

depSheet.prototype.getVertexesInSubsection = function(subsection) {
  return this.vertex.filter(function(v){ return (v.subsection == subsection) });
};

depSheet.prototype.left_neighbours = function(vertex) {
  var mysubsectionvertex = this.getSubsectionVertex(vertex.subsection);
  var section_start = mysubsectionvertex.cell[0];
  var section_end   = mysubsectionvertex.endrow;
  deLog(["looking for vertex %s's left neighbours, within section %s", vertex.title, mysubsectionvertex.title],8);
  var vertices = this.getVertexesInSubsection(mysubsectionvertex.title);
  deLog(["  considering %s candidates in %s", vertices.length, mysubsectionvertex.title],8);
  var verticesInColumn = [];
  for (var jj = 1; jj <= vertex.cell[1]; jj++) {
	verticesInColumn = vertices.filter(function(v){ return (v.type=="pdf" && v.cell[1] == vertex.cell[1]-jj) });
	if (verticesInColumn.length) { break }
  }
  if (verticesInColumn.length) {
	deLog(["  found left neighbours %s", verticesInColumn.map(function(v){return v.title})],8);
  }
  return verticesInColumn;
};

depSheet.prototype.findEdges_pdf_pdf = function() {
  var self = this;
  // locate all the pdf-pdf edges
  for (var v = 0; v < this.vertex.length; v++) {
	var vertex = this.vertex[v];
	if (vertex.type == "pdf") {
	  deLog(["computing all the pdf sources for pdf %s which is at %s", vertex.title, vertex.cell],8);
	  // the left-neighbour column of a given pdf cell is the first column to the left which contains a pdf cell within the same dependency subsection.
	  this.left_neighbours(vertex).map(function(left){ // sigh, var that = this
		deLog(["  learned pdf-pdf edge %s -> %s (%s -> %s)", self.vertex.indexOf(left), self.vertex.indexOf(vertex), left.title, vertex.title], 8);
		self.edge.push([self.vertex.indexOf(left), v]);
	  });
	}
  }
};

// locate all the party-pdf edges.
depSheet.prototype.findEdges_party_pdf = function() {
  for (var v = 0; v < this.vertex.length; v++) {
	var vertex = this.vertex[v];
	if (vertex.type == "pdf") {
	  deLog(["computing all the parties for pdf %s which is at %s", vertex.title, vertex.cell],8);
	  // walk down the string
	  for (var ii = 1; ii < this.numRows; ii++) {
		var i = vertex.cell[0] + ii;
		var j = vertex.cell[1] + 1;
		if (! this.cell[i] || ! this.cell[i][j]) { // deLog(["  !!! reached end of party string at %s,%s", i,j],8);
												   break;
												 }
		if (this.vertex[this.cell[i][j]].type != "party") { deLog(["  !!! found non-party cell at %s,%s while walking party string: %s",
																   i,j,this.vertex[this.cell[i][j]]],6); }
		this.edge.push([this.cell[i][j], v]);
		deLog(["  learned party-pdf edge %s -> %s (%s -> %s)", this.cell[i][j], v, this.vertex[this.cell[i][j]].title, vertex.title], 8);
	  }
	}
  }
};

// http://cpettitt.github.io/project/dagre-d3/latest/demo/sentence-tokenization.html
depSheet.prototype.layout_dagre = function() {
};

// https://vida.io/documents/fGzpzjP98Bs2ShMHW
depSheet.prototype.layout_force = function() {
  this.d3.nodes = this.vertex.map(function(vertex){return {title:(vertex.type == "pdf" ? vertex.subsection + " - " : "") + vertex.title,
														   type:vertex.type,
														  }});
  this.d3.links = this.edge.map(function(edge){return {source:edge[0], target:edge[1]}});

  this.sheet.getRange(this.sheet.getMaxRows(), 1)
	.setValue(
	  JSON.stringify(this.d3)
	);
};

function deLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
	params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params,"dependencies", loglevel, logconfig);
}
