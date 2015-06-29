// HTML and CSS_style to go here.

// init src="d3/d3.js"

// size of the captable.svg bars

var w = 500;
var h =100;
var barPadding = 1; 

// insert source captable data here

// create SVG element for making a bar chart

var svg = d3.select("body")
    .append("svg")
    .attr("width", w)
    .attr("height", h);

svg.selectAll("rect")
    .data(dataset)
    .enter()
    .append("rect")
    .attr("x", function(d, i) {
	return i * (w / dataset.length); // Bar width of 20 plus 1 for padding
})
    .attr("y", function(d) {
	return h - d;
})
    .attr("width", w / dataset.length - barPadding)
    .attr("height", function(d) {
	return d;
});

