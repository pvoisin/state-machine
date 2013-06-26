// https://github.com/Wolfy87/StateMachine
// https://github.com/fschaefer/Stately.js
// https://github.com/hij1nx/EventEmitter2

var StateMachine = (function() {
	var constructor = function StateMachine(definition, initialState, options) {
		var self = this;

		if(!definition || !Definition.validate(definition) || !initialState || !(initialState in definition)) {
			throw new Error("Invalid parameters!");
		}

		options = Utility.merge({
			historySize: 5
		}, options);

		// Own, private properties.
		var own = {
			definition: Utility.clone(definition),
			state: null,
			transition: null,
			history: [],
			emitter: EventEmitter.enhance(this)
		};

		function setState(state) {
			// Currently, null/undefined means the machine is not in any state, while 0 could be a valid state.
			if(!(state in own.definition)) {
				throw new WrongStateException("Unkown state: \"" + state + "\".");
			}

			own.state = state;
			own.emitter.emit("state:" + own.state, own.state);
		}

		this.getState = function() {
			return own.state;
		};

		this.getAccessibleStates = function() {
			var states = {};

			if(own.state != null) {
				var transitions = own.definition[own.state];
				for(var trigger in transitions) {
					var state = transitions[trigger].state || transitions[trigger];
					states[state] = trigger;
				};
			}

			return states;
		};

		this.getStates = function() {
			return Object.keys(own.definition);
		};

		this.getDefinition = function() {
			return Utility.clone(own.definition);
		};

		this.trigger = function(trigger/* ,... */, expiry) {
			var transitions = own.definition[own.state];
			if(own.transition) {
				var vector = own.transition.getVector();
				throw new WrongStateException("Cannot trigger \"" + trigger + "\": the machine is already transitioning (\"" + vector + "\").");
			}
			if(!(trigger in transitions)) {
				throw new WrongStateException("Cannot trigger \"" + trigger + "\" when state is \"" + own.state + "\".");
			}

			// If no action is pre-defined, let's consider it is the first optional argument.
			var action = null;
			if(!transitions[trigger].action && (typeof arguments[1] == "function")) {
				action = arguments[1];
			}

			var transition = new Transition([own.state, transitions[trigger].state || transitions[trigger]], transitions[trigger].action || action);

			// Keep track of the transition which is being performed:
			own.transition = transition;
			transition.when("status:*", function() {
				if(transition.getStatus() > Transition.status.PENDING) {
					// Warning: holding references on transitions may result in potential memory leaks so the smallest the history the better...
					if(own.history.length >= options.historySize) {
						own.history.shift();
					}
					own.history.push(transition);

					own.transition = null;

					return true;
				}
			});

			own.emitter.emit("transition:" + transition.getVector(), transition);

			// Performing the transition with any additional incoming parameters:
			var status = transition.perform.apply(transition, Array.prototype.slice.call(arguments, action ? 2 : 1));

			if(status == Transition.status.PENDING) {
				transition.once("status:completed", function() {
					setState(transitions[trigger].state || transitions[trigger]);
				});
			}
			else if(status == Transition.status.COMPLETED) {
				setState(transitions[trigger]);
			}

			return transition;
		};

		this.getTransition = function() {
			return own.transition;
		};

		this.execute = function(sequence, callback) {
			if(!sequence || !Utility.isArray(sequence)) {
				throw new Error("Invalid parameters!");
			}

			Flow.series(sequence.map(function(trigger) {
				return function(proceed) {
					var transition = self.trigger(trigger);
					if(transition.getStatus() == Transition.status.PENDING) {
						transition.when("status:*", function() {
							if(transition.getStatus() > Transition.status.PENDING) {
								proceed(null, transition);
								return true;
							}
						});
					}
					else {
						proceed(null, transition);
					}
				};
			}), function(error, results) {
				callback && callback(self, sequence, results);
			});

			return this;
		};

		this.getHistory = function() {
			return own.history.slice();
		};

		if(initialState) {
			setState(initialState);
		}
	};


	var Transition = (function() {
		var id = 1;

		var constructor = function Transition(vector, action) {
			var self = this;

			if(!vector || !Utility.isArray(vector) || action && (typeof action != "function")) {
				throw new Error("Invalid parameter!");
			}

			// Own, private properties:
			var own = {
				id: id++,
				vector: Utility.extend(vector.slice(), constructor.Vector),
				action: action,
				status: 0,
				emitter: EventEmitter.enhance(this),
				timer: null
			};

			// When performed asynchronously, the last parameter should be the expiry.
			this.perform = function(/* ..., */expiry) {
				if(action) {
					// IMPORTANT: in that case this is the responsibility of the action to complete the transition.
					try {
						// Relaying incoming parameters to the action:
						action.apply(this, arguments);
					}
					catch(exception) {
						// If something bad has happened let's interrupt the transition before bubbling the exception:
						setStatus(constructor.status.INTERRUPTED);
						throw exception;
					}
				}
				else {
					this.complete();
				}

				if(own.status == constructor.status.PENDING) {
					if(arguments.length > 0) {
						expiry = arguments[arguments.length - 1];
					}

					own.timer = setTimeout(function() {
						if(own.status < constructor.status.EXPIRED) {
							setStatus(constructor.status.EXPIRED);
						}
					}, 1000 * (expiry > 0) ? expiry : DEFAULT_EXPIRY);
				}

				return own.status;
			};

			this.complete = function(/* ... */) {
				if(own.status >= constructor.status.COMPLETED) {
					throw new WrongStateException("Already completed!");
				}

				clearTimeout(own.timer);

				// Relaying incoming parameters for them to be emitted with the departing event:
				setStatus.apply(this, [constructor.status.COMPLETED].concat(arguments));
			};

			this.interrupt = function(/* ... */) {
				if(own.status >= constructor.status.INTERRUPTED) {
					throw new WrongStateException("Already interrupted!");
				}

				clearTimeout(own.timer);

				// Relaying incoming parameters for them to be emitted with the departing event:
				setStatus.apply(this, [constructor.status.INTERRUPTED].concat(arguments));
			};

			function setStatus(code) {
				own.status = code;
				// Relaying additional parameters:
				own.emitter.emit.apply(own.emitter, ["status:" + statusLabelsByCode[code]].concat(Array.prototype.slice.call(arguments, 1)));
			}

			this.getStatus = function() {
				return own.status;
			};

			this.getVector = function() {
				return own.vector;
			};

			this.getId = function() {
				return own.id;
			};

			this.toString = function() { return JSON.stringify({"id": own.id, "vector": own.vector.toString()}); };
		};

		constructor.status = {};
		var statusLabelsByCode = ["pending", "expired", "interrupted", "completed"];
		statusLabelsByCode.forEach(function(label, index) { constructor.status[label.toUpperCase()] = index; });

		var DEFAULT_EXPIRY = 5; // second

		constructor.Vector = {
			toString: function() { return this[0] + ">" + this[1]; }
		};

		return constructor;
	})();

	constructor.Transition = Transition;


	var WrongStateException = (function() {
		var constructor = function WrongStateException(message) {
			this.name = (arguments.length > 1) ? arguments[0] : constructor.name;
			this.message = arguments[1] || message;
		};

		constructor.prototype = new Error();
		constructor.prototype.constructor = constructor;

		return constructor;
	})();

	constructor.WrongStateException = WrongStateException;


	var Definition = {
		validate: function(definition) {
// TODO: elaborate...
			return typeof definition === "object";
		}
	};


	var Flow = async;

	return constructor;
})();