Utility = _.noConflict();

EventEmitter = EventEmitter2;
delete EventEmitter2;

EventEmitter.enhance = function(object) {
	var emitter = new EventEmitter({wildcard: true, delimiter: ":"});

	// Emitter's "emit" proxy which places the enhanced object as first parameter for the listeners:
	emitter.emit = function(event) {
		EventEmitter.prototype.emit.apply(emitter, [event, object].concat(Array.prototype.slice.call(arguments, 1)));
	};

	// Exposing some emitter's method:
	["on", "once"].forEach(function(method) {
		object[method] = function() {
			emitter[method].apply(emitter, arguments);
			return object;
		};
	});

	return emitter;
};