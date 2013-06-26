(function() {
	var DEFAULT_TRANSITION_DELAY = 0.5; // second
	var timer, end;

	beforeEach(function() {
		timer && clearTimeout(timer);
		end = false;
	});

	describe("StateMachine", function() {
		var definitions = {
			"simple": {
				"STOPPED": {
					play: "PLAYING"
				},
				"PLAYING": {
					pause: "PAUSED",
					stop: "STOPPED"
				},
				"PAUSED": {
					play: "PLAYING",
					stop: "STOPPED"
				},
				"FORWARDING": {},
				"REWINDING": {}
			},
			"advanced": {
				"STOPPED": {
					play: {
						action: function() {
							console.log("Buffering...");
							var transition = this;
							setTimeout(function() {
								console.log("Buffered!");
								timer = setTimeout(function() {
									end = true;
								}, 1000 * DEFAULT_TRANSITION_DELAY * 2);
								transition.complete();
							}, 1000 * DEFAULT_TRANSITION_DELAY / 2);
						},
						state: "PLAYING"
					},
					forward: "FORWARDING",
					rewind: "REWINDING"
				},
				"PLAYING": {
					pause: "PAUSED",
					stop: "STOPPED",
					end: {
						condition: function() {
							return cursor >= track.length;
						}
					}
				},
				"PAUSED": {
					play: "PLAYING",
					stop: "STOPPED"
				},
				"FORWARDING": {},
				"REWINDING": {}
			}
		};

		describe("constructor", function() {
			it("should return an instance of StateMachine", function() {
				var machine = new StateMachine(definitions["simple"], "STOPPED");

				expect(machine).toBeInstanceOf(StateMachine);
			});

			it("requires both a definition and the initial state to start the machine into", function() {
				var definition = definitions["simple"];
				var machine = new StateMachine(definition, "STOPPED");

				expect(machine).toBeInstanceOf(StateMachine);
				expect(machine.getState()).toBe("STOPPED");
				expect(machine.getStates()).toEqual(Object.keys(definition));

				expect(function() { new StateMachine();}).toThrowException();
				expect(function() { new StateMachine(definition);}).toThrowException();
				expect(function() { new StateMachine("STOPPED");}).toThrowException();
				expect(function() { new StateMachine(definition, {});}).toThrowException();
			});

			it("should accept a simple definition of states with transitions which can be performed by some triggers", function() {
				var definition = definitions["simple"];
				var machine = new StateMachine(definition, "STOPPED");

				expect(machine).toBeInstanceOf(StateMachine);
				expect(machine.getStates()).toEqual(Object.keys(definition));
				expect(machine.getState()).toBe("STOPPED");
			});

			it("should accept a more advanced definition with default actions bound to transitions", function() {
				var definition = definitions["advanced"];
				var machine = new StateMachine(definition, "STOPPED");

				expect(machine).toBeInstanceOf(StateMachine);
				expect(machine.getStates()).toEqual(Object.keys(definition));
			});
		});

		it("should expose its definition", function() {
			var definition = definitions["advanced"];
			var machine = new StateMachine(definition, "PAUSED");

			expect(machine.getDefinition()).toEqual(definition);
		});

		it("should expose accessible states", function() {
			var definition = definitions["advanced"];
			var machine = new StateMachine(definition, "STOPPED");

			expect(machine.getAccessibleStates()).toEqual(getExpectedAccessibleStates(definition, machine));
		});

		describe("Transitions", function() {
			it("could be performed by triggers given their names", function() {
				var machine = new StateMachine(definitions["simple"], "STOPPED");
				machine.trigger("play");

				expect(machine.getState()).toBe("PLAYING");
			});

			it("could be triggered with additional arguments", function() {
				var definition = Utility.clone(definitions["advanced"]);
				spyOn(definition["STOPPED"]["play"], "action").andCallThrough();
				var machine = new StateMachine(definition, "STOPPED");
				machine.trigger("play", "A", "B", "C");

				expect(definition["STOPPED"]["play"].action).toHaveBeenCalledWith("A", "B", "C");
			});

			it("could be triggered with both temporary action and additional arguments", function() {
				var machine = new StateMachine(definitions["advanced"], "STOPPED");
				machine.trigger("play");

				waitsFor(function() { return machine.getState() == "PLAYING"; }, 1000 * DEFAULT_TRANSITION_DELAY);

				runs(function() {
					var action = jasmine.createSpy();
					machine.trigger("stop", action, "X", "Y", "Z");

					expect(action).toHaveBeenCalledWith("X", "Y", "Z");
				});
			});
console.log("TODO: test expiry");
			it("should throw an exception when trying to trigger a wrong transition", function() {
				var machine = new StateMachine(definitions["simple"], "STOPPED");

				expect(function() { machine.trigger("pause"); }).toThrowException(StateMachine.WrongStateException);
			});

			it("should throw an exception if a transition is triggered and the machine is already transitioning", function() {
				var machine = new StateMachine(definitions["simple"], "STOPPED");

				var delay = DEFAULT_TRANSITION_DELAY;
				var transition = machine.trigger("play", function() {
					jasmine.log(arguments);
					setTimeout(function() { transition.complete(); }, 1000 * delay);
				});

				expect(transition.getStatus()).toBe(StateMachine.Transition.status.PENDING);
				expect(function() { machine.trigger("stop"); }).toThrowException(StateMachine.WrongStateException);

				waits(1000 * delay);

				runs(function() {
					expect(machine.getState()).toBe("PLAYING");
				});
			});

			it("should expose the transition which is being performed", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED");
				var delay = DEFAULT_TRANSITION_DELAY;
				var transition = machine.trigger("play", function() {
					jasmine.log(arguments);
				});

				expect(transition.getStatus()).toBe(StateMachine.Transition.status.PENDING);
				expect(machine.getTransition()).toBe(transition);
			});

			it("should return null when asked for the current transition and none is being performed", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED");

				// No transition has been performed yet:
				expect(machine.getTransition()).toBe(null);

				var transition = machine.trigger("play", function() {
					jasmine.log(arguments);
					this.complete();
				});

				// Previous transition has performed, synchronously:
				expect(machine.getTransition()).toBe(null);

				var delay = DEFAULT_TRANSITION_DELAY;
				var transition = machine.trigger("stop", function() {
					jasmine.log(arguments);
					setTimeout(function() { transition.complete(); }, 1000 * delay);
				});

				expect(transition.getStatus()).toBe(StateMachine.Transition.status.PENDING);
				expect(machine.getTransition()).toBe(transition);

				waits(1000 * delay);

				runs(function() {
					expect(transition.getStatus()).toBe(StateMachine.Transition.status.COMPLETED);

					// Previous transition has performed, asynchronously:
					expect(machine.getTransition()).toBe(null);
				});
			});

			it("should emit appropriate \"state\" events when changing state", function() {
				var definition = definitions["simple"];
				var sequence = ["play", "pause", "stop", "play", "stop", "play", "pause", "stop"];
				var machine = new StateMachine(definition, "STOPPED", {historySize: sequence.length});

				var observers = {
					"state:*": function(machine) { jasmine.log("* (" + this.event + ")"); }
				};
				Object.keys(definition).forEach(function(state) {
					observers["state:" + state] = function(machine) {
						jasmine.log(this.event);
						events.push(this.event);
					};
				});
				Object.keys(observers).forEach(function(event) {
					spyOn(observers, event).andCallThrough();
					machine.on(event, observers[event]);
				});

				var events = [];
				var initialState = machine.getState();
				var history = null;

				machine.execute(sequence, function() {
					history = machine.getHistory();
				});

				waitsFor(function() { return !!history; }, sequence.filter(function(trigger) { return trigger == "play"}).length * 1000 * DEFAULT_TRANSITION_DELAY);

				runs(function() {
					history.forEach(function(transition, index) {
						var vector = transition.getVector();
						expect(observers["state:" + vector[1]]).toHaveBeenCalledWith(machine, vector[1]);
					});

					expect(observers["state:*"].callCount).toBe(history.length);
					expect(events).toEqual(Sequence.getStates(machine, sequence).map(function(state) { return "state:" + state; }));
				});
			});

			it("should emit appropriate \"transition\" events when changing state", function() {
				var definition = definitions["simple"];
				var sequence = ["play", "pause", "stop", "play", "stop", "play", "pause", "stop"];
				var machine = new StateMachine(definition, "STOPPED", {historySize: sequence.length});

				var observers = {
					"transition:*": function(machine) { jasmine.log("* (" + this.event + ")"); }
				};
				Object.keys(definition).forEach(function(state) {
					Object.keys(definition[state]).forEach(function(trigger) {
						observers["transition:" + state + ">" + (definition[state][trigger].state || definition[state][trigger])] = function(machine) {
							jasmine.log(this.event);
							events.push(this.event);
						};
					});
				});
				Object.keys(observers).forEach(function(event) {
					spyOn(observers, event).andCallThrough();
					machine.on(event, observers[event]);
				});

				var events = [];
				var initialState = machine.getState();
				var history = null;

				machine.execute(sequence, function() {
					history = machine.getHistory();
				});

				waitsFor(function() { return !!history; }, sequence.filter(function(trigger) { return trigger == "play"}).length * 1000 * DEFAULT_TRANSITION_DELAY);

				runs(function() {
					history.forEach(function(transition, index) {
						var vector = transition.getVector();
						expect(observers["transition:" + vector]).toHaveBeenCalledWith(machine, transition);
					});

					expect(observers["transition:*"].callCount).toBe(history.length);
					expect(events).toEqual(Sequence.getStates(machine, sequence).map(function(state, index, states) { return "transition:" + (states[index - 1] || initialState) + ">" + state; }));
				});
			});

			it("could execute a sequence", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED");

				machine.execute(["play", "pause", "stop", "play", "stop", "play", "pause", "stop"]);
			});

			it("should expose its history of transitions in chronological order, which shouldn't be larger than specified size", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED", {historySize: 3});
				var t1 = machine.trigger("play");
				var t2 = machine.trigger("pause");
				var t3 = machine.trigger("play");
				var t4 = machine.trigger("stop");
				var t5 = machine.trigger("play");
				var t6 = machine.trigger("stop");

				expect(machine.getHistory()).toEqual([t4, t5, t6]);
			});
		});

		describe("StateMachine.Transition", function() {
			it("could be performed synchronously without any action and be completed", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED");
				var transition = machine.trigger("play");

				expect(transition.getStatus()).toBe(StateMachine.Transition.status.COMPLETED);
			});

			it("could be performed synchronously with some action and be completed", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED");
				var transition = machine.trigger("play", function() {
					jasmine.log(arguments);
					this.complete();
				});

				expect(transition.getStatus()).toBe(StateMachine.Transition.status.COMPLETED);
			});

			it("could be performed *asynchronously* with some action and be completed", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED");
				var delay = DEFAULT_TRANSITION_DELAY;
				var transition = machine.trigger("play", function() {
					jasmine.log(arguments);
					setTimeout(function() { transition.complete(); }, 1000 * delay);
				});

				expect(transition.getStatus()).toBe(StateMachine.Transition.status.PENDING);

				waits(1000 * delay);

				runs(function() {
					expect(transition.getStatus()).toBe(StateMachine.Transition.status.COMPLETED);
				});
			});


			it("could be performed synchronously with some action and be interrupted", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED");
				var transition = machine.trigger("play", function() {
					jasmine.log(arguments);
					this.interrupt();
				});

				expect(transition.getStatus()).toBe(StateMachine.Transition.status.INTERRUPTED);
			});

			it("could be performed *asynchronously* with some action and be interrupted", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED");
				var delay = DEFAULT_TRANSITION_DELAY;
				var transition = machine.trigger("play", function() {
					jasmine.log(arguments);
					setTimeout(function() { transition.interrupt(); }, 1000 * delay);
				});

				expect(transition.getStatus()).toBe(StateMachine.Transition.status.PENDING);

				waits(1000 * delay);

				runs(function() {
					expect(transition.getStatus()).toBe(StateMachine.Transition.status.INTERRUPTED);
				});
			});

			it("could be performed *asynchronously* and expire", function() {
				var definition = definitions["simple"];

				var machine = new StateMachine(definition, "STOPPED");
				var expiry = 1;
				var transition = machine.trigger("play", function() {
					jasmine.log(arguments);
					setTimeout(function() { transition.complete(); }, 2 * 1000 * expiry);
				}, expiry);

				expect(transition.getStatus()).toBe(StateMachine.Transition.status.PENDING);

				waits(1000 * expiry);

				runs(function() {
					expect(transition.getStatus()).toBe(StateMachine.Transition.status.EXPIRED);
				});
			});
		});

		it("could perform transition when a trigger's condition becomes true", function() {
			var machine = new StateMachine(definitions["advanced"]);
			machine.trigger("play");

			waits(1000 * DEFAULT_TRANSITION_DELAY * 2);

			runs(function() {
				machine.tick();

				expect(machine.getState()).toBe("STOPPED");
			});
		});
	});

	var Sequence = {
		// Retrieve the successive states the machine would transition through by executing the given triggers sequence.
		getStates: function(machine, triggers) {
			var states = [];
			var definition = machine.getDefinition();

			triggers.forEach(function(trigger) {
				var state = Utility.last(states) || machine.getState();
				states.push(definition[state][trigger].state || definition[state][trigger]);
			});

			return states;
		}
	};

	function getExpectedAccessibleStates(definition, machine) {
		var transitions = definition[machine.getState()];

		var states = Object.keys(transitions).reduce(function(states, trigger) {
			states[transitions[trigger].state || transitions[trigger]] = trigger;
			return states;
		}, {});

		return states;
	}
})();