/*global defaults:false, parse:false, Compressor:false, JS_Parse_Error:false, DefaultsError:false */
/*jshint globalstrict:true */

'use strict';

// Create a simple wrapper around UglifyJS

var default_options = {};
function uglify(code, options) {
	// Create copies of the options
	var parse_options = defaults({}, options.parse);
	var compress_options = defaults({}, options.compress);
	var output_options = defaults({}, options.output);

	parse_options = defaults(parse_options, default_options.parse, true);
	compress_options = defaults(compress_options, default_options.compress, true);
	output_options = defaults(output_options, default_options.output, true);

	// 1. Parse
	var toplevel_ast = parse(code, parse_options);
	toplevel_ast.figure_out_scope();

	// 2. Compress
	var compressor = new Compressor(compress_options);
	var compressed_ast = toplevel_ast.transform(compressor);

	// 3. Mangle
	compressed_ast.figure_out_scope();
	compressed_ast.compute_char_frequency();
	compressed_ast.mangle_names();

	// 4. Generate output
	code = compressed_ast.print_to_string(output_options);

	return code;
}


// Handle the UI

var uglify_options;
var $options = $('options');
var $options_btn = $('options-btn');
var $options_reset = $('options-reset');
var $options_auto = $('options-auto');
var $go = $('go');
var $out = $('out');
var $out_container = $('out-container');
var $out_stats = $('out-stats');
var $stats = $('stats');
var $in = $('in');
var $info = $('info');
var $error = $('error');
var $error_container = $('error-container');

function $(id) {
	return document.getElementById(id);
}

var console = window.console || { log: function () {}, error: function () {} };

var default_options_text = $options.textContent || $options.innerText;
set_options_initial();

$go.addEventListener('click', go);
$options_btn.addEventListener('click', toggle_options);
$options_reset.addEventListener('click', reset_options);
$options_auto.addEventListener('click', toggle_autominify);
$out.addEventListener('focus', select_text);

function show() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].removeAttribute('class');
	}
}

function hide() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].className = 'hidden';
	}
}

function toggle_autominify() {
	if ($options_auto.checked)
		$in.addEventListener('input', go);
	else
		$in.removeEventListener('input', go);
}

function toggle_options() {
	if ($options.className === 'hidden') {
		$options_btn.innerHTML = 'Save';
		$options_btn.className = 'active';
		hide($in, $go);
		show($options, $options_reset, $options_auto, $('options-auto-label'));
		$options.focus();
	} else {
		if (set_options()) {
			hide($options, $options_reset, $options_auto, $('options-auto-label'));
			$options_btn.innerHTML = 'Options';
			$options_btn.removeAttribute('class');
			show($in, $go);
			$in.focus();
		}
	}
}

function get_options(value) {
	/*jshint evil:true */
	return new Function('return (' + (value || $options.value) + ');')();
}

function set_options() {
	var old_options = uglify_options;
	try {
		uglify_options = get_options();

		// The options could be parsed. Try to update localStorage.
		try {
			if (default_options_text === $options.value)
				localStorage.removeItem('uglify-options');
			else
				localStorage.setItem('uglify-options', $options.value);
		} catch (e) {}

		// Run Uglify with the new options.
		go();
		return true;
	} catch (e) {
		if (e instanceof JS_Parse_Error) {
			// the options are actually okay, just the code that's bad
			show_error(e, $in.value);
			return true;
		} else {
			uglify_options = old_options;
			show_error(e);
			return false;
		}
	}
}

function reset_options() {
	$options.value = default_options_text;

	$options_auto.checked = true;
	toggle_autominify();

	$options_btn.focus();
}

function set_options_initial() {
	default_options = get_options(default_options_text);

	// If there are options saved with localStorage, load them now.
	try {
		var options_text = localStorage.getItem('uglify-options');
		if (options_text) {
			$options.value = options_text;
		}
	} catch (e) {}

	try {
		uglify_options = get_options();
	} catch (e) {
		// if it didn't work, reset the textarea
		$options.value = default_options_text;
		uglify_options = default_options;
	}

	toggle_autominify();
}

function encodeHTML(str) {
	return (str + '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/"/g, '&quot;');
}

function go() {
	var input = $in.value;

	try {
		main();
	} catch (e) {
		show_error(e, input);
	}

	function main() {
		var res = uglify(input, uglify_options);
		hide($info, $error_container);
		show($out_container, $out_stats);

		$out.value = res || '/* no output! */';
		$stats.innerHTML = res.length + ' bytes, saved ' + ((1 - res.length / input.length) * 100).toFixed(2) + '%';
	}
}

function show_error(e, param) {
	console.error('Error', e);
	hide($info, $out_container); $out_stats.className = 'invisible';
	show($error_container);

	if (e instanceof JS_Parse_Error) {
		var input = param;
		var lines = input.split('\n');
		var line = lines[e.line - 1];
		e = 'Parse error: <strong>' + encodeHTML(e.message) + '</strong>\n' +
			'<small>Line ' + e.line + ', column ' + (e.col + 1) + '</small>\n\n' +
			(lines[e.line-2] ? (e.line - 1) + ': ' + encodeHTML(lines[e.line-2]) + '\n' : '') +
			e.line + ': ' +
				encodeHTML(line.substr(0, e.col)) +
				'<mark>' + encodeHTML(line.substr(e.col, 1) || ' ') + '</mark>' +
				encodeHTML(line.substr(e.col + 1)) + '\n' +
			(lines[e.line] ? (e.line + 1) + ': ' + encodeHTML(lines[e.line]) : '');
	} else if (e instanceof DefaultsError) {
		e = '<strong>' + encodeHTML(e.msg) + '</strong>';
	} else if (e instanceof Error) {
		e = e.name + ': <strong>' + encodeHTML(e.message) + '</strong>';
	} else {
		e = '<strong>' + encodeHTML(e) + '</strong>';
	}

	$error.innerHTML = e;
}

function select_text() {
	/*jshint validthis:true */
	var self = this;
	self.select();

	// Workaround for Chrome
	self.onmouseup = self.onkeyup = function() {
		// Prevent further mouseup intervention
		self.onmouseup = self.onkeyup = null;
		self.scrollTop = 0;
		return false;
	};
	return false;
}
