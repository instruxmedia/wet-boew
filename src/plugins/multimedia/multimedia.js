/*
 * @title WET-BOEW Multimedia PLayer
 * @overview An accessible multimedia player for <audio> and <video> tags, including a Flash fallback
 * @license wet-boew.github.io/wet-boew/License-en.html / wet-boew.github.io/wet-boew/Licence-fr.html
 * @author WET Community
 */

(function( $, window, document, vapour, undef ) {
"use strict";

/* Local scoped variables*/
var $document = $(document),
	$selector = ".wb-mltmd",
	$seed = 0,
	$templatetriggered = false,
	formatTime, parseTime, expand, loadCaptionsExternal, loadCaptionsInternal,
	parseHtml, parseXml, playerApi, updateCaptions,
	i18n, i18nText;

/* helper functions*/

/*
@method formatTime
@description format a number of seconds to SMTPE Timecode format (HH:MM:SS.FF)
@param {Float} time The time to format
@returns {String} the formatted time
*/
formatTime = function( time ) {
	var index = 2, timecode = "",
		secondsIn, current, pad;

	pad = function( number, digits ) {
		return new Array( Math.max( digits - String( number ).length + 1, 0 ) ).join( 0 ) + number;
	};

	time = Math.floor( time );

	//Loop to extract hours, minutes and seconds
	while (index >= 0) {
		secondsIn = Math.pow( 60, index ); //Get the number of seconds for the current iteration (hour, minute or second)
		current = Math.floor( time / secondsIn );

		if ( timecode !== "" ) {
			timecode += ":";
		}

		timecode += pad( current, 2 );
		time -= secondsIn * current;
		index -= 1;
	}
	return timecode;
};

/*
@method parseTime
@description parse an SMTPE Timecode string (HH:MM:SS.FF) or duration (45s) and returns the number of seconds for the timecode
@param {String} time The timecode or duration string to parse
@returns {Float} the number of seconds in time
*/
parseTime = function( time ) {
	var p, parts, timeStringPortion, partLength, seconds;

	if ( time !== undef ) {
		if ( time.charAt( time.length - 1 ) === "s" ) {
			//Duration parsing
			return parseFloat( time.substring( 0, time.length - 1 ) );
		} else {
			//SMTPE Timecode Parsing
			parts = time.split( ":" ).reverse();
			seconds = 0;

			for (p = 0, partLength = parts.length; p < partLength; p += 1 ) {
				timeStringPortion = p === 0 ?
					parseFloat( parts[ p ] ) :
					parseInt( parts[ p ], 10 );
				seconds += timeStringPortion * Math.pow( 60, p );
			}
			return seconds;
		}
	}
	return -1;
};

// TODO: Document this function
expand = function( elm, withPlayer ) {
	var $this = $( elm ),
		$data = $this.data( "properties" );

	return withPlayer !== undef ?
		 [ $this, $data, $data.player ] :
		 [ $this, $data ];
};


/*
@method parseHtml
@description parse an HTML fragment and extract embed captions
@param {String} content The HTML fragment containing the captions
@returns {Array} An array of captions objects (ex: {text: "Caption", begin: 0, end :10})
*/
parseHtml = function( content ) {
	var captions = [],
		captionSelector = ".wb-tmtxt",
		captionElements = content.find( captionSelector ),
		len = captionElements.length,
		i, captionElement, json, begin, end;

	for ( i = 0; i !== len; i += 1 ) {
		captionElement = $( captionElements[ i ] );
		begin = -1;
		end = -1;

		if ( captionElement.attr("data-begin") !== undef ) {
			begin = parseTime( captionElement.attr( "data-begin" ) );
			end = captionElement.attr( "data-end" ) !== undef ?
				parseTime( captionElement.attr( "data-end" ) ) :
				parseTime( captionElement.attr( "data-dur" ) ) + begin;
		} else if (captionElement.attr("data") !== undef) {
			json = captionElement.attr("data")
				.replace( /(begin|dur|end)/g, "\"$1\"" )
				.replace( /'/g, "\"" );
			json = $.parseJSON(json);
			begin = parseTime( json.begin );
			end = json.end !== undefined ?
				parseTime( json.end ) :
				parseTime( json.dur ) + begin;
		}

		//Removes nested captions if an
		captionElement = captionElement.clone();
		captionElement.find(captionSelector).detach();

		captions[ captions.length ] = {
				text: captionElement.html(),
				begin: begin,
				end: end
		};
	}

	return captions;
};

/*
@method parseXml
@description parse an TTML (Xml) document and extract captions
@param {String} content The TTML fragment containing the captions
@returns {Array} An array of captions objects (ex: {text: "Caption", begin: 0, end :10})
*/
parseXml = function( content ) {
	var captions = [],
		captionSelector = "[begin]",
		captionElements = content.find( captionSelector ),
		len = captionElements.length,
		i, captionElement, begin, end;

	for ( i = 0; i !== len; i += 1 ) {
		captionElement = $( captionElements[ i ] );
		begin = parseTime( captionElement.attr( "begin" ) );
		end = captionElement.attr("end") !== undef ?
			parseTime(captionElement.attr("end")) :
			parseTime(captionElement.attr("dur")) + begin;


		captionElement = captionElement.clone();
		captionElement.find( captionSelector ).detach();

		captions[ captions.length ] = {
			text: captionElement.html(),
			begin: begin,
			end: end
		};
	}
	return captions;
};

/*
@method loadCaptionsExternal
@description Loads captions from an external source (HTML embed or TTML)
@param {Object} elm The jQuery object for the multimedia player loading the captions
@param {String} url The url for the captions resource to load
@fires captionsloaded.multimedia.wb
@fires captionsloadfailed.multimedia.wb
*/
loadCaptionsExternal = function( elm, url ) {
	$.ajax({
		url: url,
		dataType: "html",
		dataFilter: function( data ) {
			//Filters out images and objects from the content to avoid loading them
			return data.replace( /<img|object [^>]*>/g, "" );
		},
		success: function( data ) {
			elm.trigger({
				type: "captionsloaded.multimedia.wb",
				captions: data.indexOf( "<html" ) !== -1 ?
					parseHtml( $( data ) ) :
					parseXml( $( data ) )
			});
		},
		error: function( response, textStatus, errorThrown ) {
			elm.trigger({
				type: "captionsloadfailed.multimedia.wb",
				error: errorThrown
			});
		}
	});
};

/*
@method loadCaptionsInternal
@description Loads same page captions emebed in HTML
@param {Object} elm The jQuery object for the multimedia player loading the captions
@param {Object} obj The jQUery object containing the captions
@fires captionsloaded.multimedia.wb
*/
loadCaptionsInternal = function( elm, obj ) {
	elm.trigger({
		type: "captionsloaded.multimedia.wb",
		captions: parseHtml( obj )
	});
};

/*
@method updateCaptions
@description Update the captions for a multimedia player (called from the timeupdate event of the HTML5 media API)
@param {Object} area The jQuery object for the element where captions are displayed
@param {Float} seconds The current time of the media (use to sync the captions)
@param {Object} captions The JavaScript object containing the captions
*/
updateCaptions = function( area, seconds, captions ) {
	var caption, _c,
		_clen = captions.length;

	area.empty();

	for ( _c = 0; _c < _clen; _c += 1 ) {
		caption = captions[ _c ];
		if ( seconds >= caption.begin && seconds <= caption.end ) {
			area.append( $( "<div>" + caption.text + "</div>" ) );
		}
	}
};

/*
@method playerApi
@description Normalizes the calls to the HTML5 media API and Flash Fallback
@param {String} fn The function to call
@param {} Args The arguments to send to the function call
*/
playerApi = function( fn, args ) {
	var $this, captionsArea, method;

	switch ( fn ) {
		case "play":
			try {
				this.object.play();
			} catch ( ex ) {
				this.object.doPlay();
			}
			break;
		case "pause":
			try {
				this.object.pause();
			} catch ( ex ) {
				this.object.doPause();
			}
			break;
		case "getCaptionsVisible":
			return $( this ).find( ".wb-mm-cc" ).hasClass( "on" );
		case "setCaptionsVisible":
			$this = $( this );
			captionsArea = $this.find( ".wb-mm-cc" );
			if ( args ) {
				captionsArea.addClass("on");
			} else {
				captionsArea.removeClass("on");
			}
			$this.trigger( "captionsvisiblechange.multimedia.wb" );
			break;
		case "setPreviousTime":
			this.object.previousTime = args;
			break;
		case "getBuffering":
			return this.object.buffering || false;
		case "setBuffering":
			this.object.buffering = args;
			break;
		case "getPreviousTime":
			return this.object.previousTime;
		case "setPreviousTime":
			this.object.previousTime = args;
			break;
		default:
			method = fn.charAt( 3 ).toLowerCase() + fn.substr( 4 );
			switch ( fn.substr( 0, 3 ) ) {
			case "get":
				return typeof this.object[ method ] !== "function" ?
					this.object[ method ] :
					this.object[ method ]();
			case "set":
				typeof this.object[ method ] !== "function" ?
					this.object[ method ] = args :
					this.object[ fn ]( args );
			}
	}
};

$document.on( "timerpoke.wb", $selector, function() {
	window._timer.remove( $selector );

	// Only initialize the i18nText once
	if ( !i18nText ) {
		i18n = window.i18n;
		i18nText = {
			rewind: i18n( "rew" ),
			ff: i18n( "ffwd" ),
			play: i18n( "play" ),
			pause: i18n( "pause" ),
			cc_on: i18n( "cc", "on" ),
			cc_off: i18n( "cc", "off"),
			cc_error: i18n ( "cc-err" ),
			mute_on: i18n( "mute", "on"),
			mute_off: i18n( "mute", "off"),
			duration: i18n( "dur"),
			position: i18n( "pos")
		};
	}

	if ( !$templatetriggered ) {
		$templatetriggered = true;
		$document.trigger({
			type: "ajax-fetch.wb",
			element: $( $selector ),
			fetch: "" + vapour.getPath( "/assets" ) + "/mediacontrols.html"
		});
	}
});

$document.on( "ajax-fetched.wb", $selector, function( event ) {
	var $this = $( this ),
		$template = event.pointer.html();

	$this.data( "template", $template );
	$this.trigger({
		type: "init.multimedia.wb"
	});
});

$document.on( "init.multimedia.wb", $selector, function() {

	var $this = $( this ),
		$id = $this.attr( "id" ) !== undef ? $this.attr( "id" ) : "wb-mediaplayer-" + ( $seed += 1 ),
		$media = $this.children( "audio, video" ).eq( 0 ),
		$m_id = $media.attr( "id" ) !== undef ? $media.attr( "id" ) : "" + $id + "-media",
		$type = $media.is( "video" ) ? "video" : "audio",
		$width = $type === "video" ? $media.attr( "width" ) : "0",
		$height = $type === "video" ? $media.attr( "height" ) : "0",
		$captions = $media.children("track[kind='captions']") ? $media.children("track[kind='captions']").attr("src") : undef,
		data = $.extend({
			id: $id,
			media: $media,
			m_id: $m_id,
			type: $type,
			height: $height,
			width: $width,
			captions: $captions,
			object: ""
		}, i18nText);

	if ( $media.attr( "id" ) === undef ) {
		$media.attr( "id", $m_id );
	}

	$this.data( "properties", data );

	if ( $media.get( 0 ).error === null && $media.get( 0 ).currentSrc !== "" && $media.get( 0 ).currentSrc !== undef ) {
		$this.trigger( "" + $type + ".multimedia.wb" );
	} else {
		$this.trigger( "fallback.multimedia.wb" );
	}
});

$document.on( "fallback.multimedia.wb", $selector, function() {
	var _ref = expand( this ),
		$this = _ref[ 0 ],
		$data = _ref[ 1 ],
		$media = $data.media,
		$poster = $media.attr( "poster" ),
		$source = $data.media.find( "source" ),
		$playerresource;


	$data.flashvars = "id=" + $data.m_id;
	$playerresource = vapour.getPath( "/assets" ) + "/multimedia.swf?" + $data.flashvars;
	$data.poster = "";
	if ( $data.type === "video" ) {
		$data.poster = "<img src='" + $poster + " class='img-responsive' height='" +
			$data.height + "' width='" + $data.width + "' alt='" + $media.attr( "title" ) + "'/>";
		$data.flashvars += "&height=" + $media.height() + "&width=" +
			$media.width() + "&posterimg=" +
			encodeURI( vapour.getUrlParts( $poster ).absolute ) + "&media=" +
			encodeURI( vapour.getUrlParts( $source.filter( "[type='video/mp4']" ).attr( "src" ) ).absolute );
	} else {
		$data.flashvars += "&media=" + encodeURI( vapour.getUrlParts( $source.filter( "[type='audio/mp3']" ).attr( "src" ) ).absolute );
	}
	$data.sObject = "<object id='" + $data.m_id + "' width='" + $data.width +
		"' height='" + $data.height + "' class='" + $data.type +
		"' type='application/x-shockwave-flash' data='" +
		$playerresource + "' tabindex='-1'>" +
		"<param name='movie' value='" + $playerresource + "'/>" +
		"<param name='flashvars' value='" + $data.flashvars + "'/>" +
		"<param name='allowScriptAccess' value='always'/>" +
		"<param name='bgcolor' value='#000000'/>" +
		"<param name='wmode' value='opaque'/>" +
		$data.poster + "</object>";
	$this.data( "properties", $data );

	$this.trigger( "renderui.multimedia.wb" );
});

$document.on( "video.multimedia.wb", $selector, function() {
	var _ref = expand( this ),
		$this = _ref[ 0 ],
		$data = _ref[ 1 ];

	$data.sObject = $data.media.wrap( "<div />" ).parent().html();
	$data.poster = "<img src='" + $data.media.attr( "poster" ) +
		"' class='img-responsive' height='" + $data.height +
		"' width='" + $data.width + "' alt='" + $data.media.attr( "title" ) + "'/>";

	$this.data( "properties", $data );

	$this.trigger( "renderui.multimedia.wb" );
});

$document.on("audio.multimedia.wb", $selector, function() {
	// Implement audio player
	var $data, $this, _ref;
	return _ref = expand(this), $this = _ref[0], $data = _ref[1], _ref;
});

$document.on("renderui.multimedia.wb", $selector, function() {
	var _ref = expand( this ),
		$this = _ref[ 0 ],
		$data = _ref[ 1 ],
		$player,
		captionsUrl = vapour.getUrlParts( $data.captions ).absolute;

	$this.find( "video, audio" ).replaceWith( window.tmpl( $this.data( "template" ), $data ) );
	$player = $( "#" + $data.m_id );
	$data.player = $player.is( "object") ? $player.children( ":first-child" ) : $player.load();

	// Create an adapter for the event management
	$data.player.on( "durationchange play pause ended volumechange timeupdate captionsloaded captionsloadfailed captionsvisiblechange waiting canplay progress", function( event ) {
		$this.trigger( event );
	});

	this.object = $player.get( 0 );
	this.player = playerApi;
	$this.data( "properties", $data );

	if ( $data.captions === undefined ) {
		return 1;
	}

	if ( captionsUrl !== window.location.href ) {
		loadCaptionsExternal( $player, captionsUrl );
	} else {
		loadCaptionsInternal( $player, captionsUrl );
	}
});

/*
UI Bindings
*/

$document.on( "click", $selector, function( event ) {
	var eventTarget = event.target,
		playerTarget = event.currentTarget,
		which = event.which,
		className = eventTarget.className,
		$target;

	// Ignore middle and right mouse buttons
	if ( !which || which === 1 ) {
		$target = $( eventTarget );
		if ( className.match( /playpause|-(play|pause)|wb-mm-ovrly/ ) ) {
			playerTarget.player( playerTarget.player( "getPaused" ) ? "play" : "pause" );
		} else if ( className.match( /\bcc\b|-subtitles/ )  ) {
			playerTarget.player( "setCaptionsVisible", !playerTarget.player( "getCaptionsVisible" ) );
		} else if ( className.match( /\bmute\b|-volume-(up|off)/ ) ) {
			playerTarget.player( "setMuted", !playerTarget.player( "getMuted" ) );
		} else if ( $target.is( "progress" ) || className.indexOf( "wb-progress-inner") !== -1 || className.indexOf( "wb-progress-outer" ) !== -1 ) {
			playerTarget.player( "setCurrentTime", playerTarget.player( "getDuration" ) * ( ( event.pageX - $target.offset().left ) / $target.width() ) );
		} else if ( className.match( /\brewind\b|-backwards/ ) ) {
			playerTarget.player( "setCurrentTime", playerTarget.player( "getCurrentTime" ) - playerTarget.player( "getDuration" ) * 0.05 );
		} else if ( className.match( /\bfastforward\b|-forward/ ) ) {
			playerTarget.player( "setCurrentTime", playerTarget.player( "getCurrentTime" ) + playerTarget.player( "getDuration" ) * 0.05 );
		}
	}
});

$document.on( "keydown", $selector, function( event ) {
	var playerTarget = event.currentTarget,
		which = event.which,
		ctrls = ".wb-mm-ctrls",
		ref = expand( playerTarget ),
		$this = ref[ 0 ],
		volume = 0;

	switch ( which ) {
	case 32:
		$this.find( ctrls + " .playpause" ).trigger( "click" );
		break;

	case 37:
		$this.find( ctrls + " .rewind ").trigger( "click" );
		break;

	case 39:
		$this.find( ctrls + " .fastforward" ).trigger( "click" );
		break;

	case 38:
		volume = Math.round( playerTarget.player( "getVolume" ) * 10 ) / 10 + 0.1;
		playerTarget.player( "setVolume", volume < 1 ? volume : 1 );
		break;

	case 40:
		volume = Math.round( playerTarget.player( "getVolume" ) * 10 ) / 10 - 0.1;
		playerTarget.player( "setVolume",  volume > 0 ? volume : 0 );
		break;

	default:
		return true;
	}
	return false;
});

$document.on( "keyup", $selector, function( event ) {
	if ( event.which === 32 ) {
		//Allows the spacebar to be used for play/pause without double triggering
		return false;
	}
});

$document.on( "durationchange play pause ended volumechange timeupdate captionsloaded.multimedia.wb captionsloadfailed.multimedia.wb captionsvisiblechange waiting canplay progress", $selector, function( event ) {
	var eventTarget = event.currentTarget,
		eventType = event.type,
		$this = $( eventTarget ),
		currentTime,
		button;

	switch ( eventType ) {
	case "play":
		button = $this.find( ".playpause .glyphicon" )
			.removeClass( "glyphicon-play" )
			.addClass( "glyphicon-pause" )
			.parent();

		button.attr( "title", button.data( "state-off" ) );

		$this.find( ".wb-mm-ovrly" ).addClass( "playing" );

		$this.find( ".progress" ).addClass( "active" );
		break;

	case "pause":
		button = $this.find( ".playpause .glyphicon" )
			.removeClass( "glyphicon-pause" )
			.addClass( "glyphicon-play" )
			.parent();

		button.attr( "title", button.data( "state-on" ) );

		$this.find( ".progress" ).removeClass( "active" );
		break;

	case "ended":
		button = $this.find( ".playpause .glyphicon" )
			.removeClass( "glyphicon-pause" )
			.addClass( "glyphicon-play" )
			.parent();

		button.attr( "title", button.data( "state-on" ) );
		$this.find( ".wb-mm-ovrly" ).removeClass( "playing" );
		break;

	case "volumechange":
		// TODO: Think can be optimized for the minifier with some ternaries
		button = $this.find( ".mute .glyphicon" );
		if ( eventTarget.player( "getMuted" ) ) {
			button = button.removeClass( "glyphicon-volume-up" )
				.addClass( "glyphicon-volume-off" )
				.parent();

			button.attr( "title" , button.data( "state-off" ) );
		} else {
			button = button.removeClass( "glyphicon-volume-off" )
				.addClass( "glyphicon-volume-up" )
				.parent();
			button.attr( "title", button.data( "state-on" ) );
		}
		break;

	case "timeupdate":
		currentTime = eventTarget.player( "getCurrentTime" );
		$this.find( "progress" )
			.attr(
				"value",
				Math.round( currentTime / eventTarget.player( "getDuration" ) * 1000 ) / 10
			);

		$this.find( ".wb-mm-tmln-crrnt span" )
			.text( formatTime( currentTime ) );

		if ( $.data( eventTarget, "captions" ) !== undef ) {
			updateCaptions(
				$this.find( ".wb-mm-cc" ),
				currentTime,
				$.data( eventTarget, "captions" )
			);
		}
		break;

	case "durationchange":
		$this.find( ".wb-mm-tmln-ttl span" )
			.text( formatTime( eventTarget.player( "getDuration" ) ) );
		break;

	case "captionsloaded":
		$.data( eventTarget, "captions", event.captions );
		break;

	case "captionsloadfailed":
		$this.find( ".wb-mm-cc" )
		.append( "<p class='errmsg'><span>" + i18nText.cc_error + "</span></p>" )
		.end()
		.find( ".cc" )
		.attr( "disabled", "" );
		break;

	case "captionsvisiblechange":
		// TODO: Think can be optimized for the minifier with some ternarie
		button = $this.find( ".cc" );
		if ( eventTarget.player( "getCaptionsVisible" ) ) {
			button.attr( "title", button.data( "state-on" ) )
				.css( "opacity", "1" );
		} else {
			button.attr( "title", button.data( "state-off" ) )
				.css( "opacity", ".5" );
		}
		break;

	case "waiting":
		$this.find( ".display" ).addClass( "waiting" );
		break;

	case "canplay":
		$this.find( ".display" ).removeClass( "waiting" );
		break;

	// Fallback for browsers that don't implement the waiting events
	case "progress":
        // Waiting detected, display the loading icon
        if ( this.player( "getPaused" ) === false && this.player( "getCurrentTime" ) === this.player( "getPreviousTime" ) ) {
                if ( eventTarget.player( "getBuffering" ) === false ) {
                        eventTarget.player( "setBuffering", true );
                        $this.trigger( "waiting" );
                }
        // Waiting has ended, but icon is still visible - remove it.
        } else if ( eventTarget.player( "getBuffering" ) === true ) {
                eventTarget.player( "setBuffering", false );
                $this.trigger( "canplay" );
        }
        eventTarget.player( "setPreviousTime", eventTarget.player( "getCurrentTime" ) );
	}
});

window._timer.add( $selector );

})( jQuery, window, document, vapour, undefined );