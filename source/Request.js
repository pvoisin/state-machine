var Request = (function() {
	var token = 0;

	var constructor = function Request(locator, options) {
		if(!locator) {
			throw new Error("Invalid parameters!");
		}

		options = Utility.merge({
			method: "GET"
		}, options);

		var self = this;

		var own = {
			transport: new XMLHttpRequest(),
			response: null,
			emitter: EventEmitter.enhance(this),
			machine: new StateMachine({
				"INITIALIZED": {
					"send": {
						action: function(data) {
							own.transport.send(data);
							this.complete();
						},
						state: "SENT"
					}
				},
				"SENT": {
					"complete": {
						condition: function() {
							return !!own.response;
						},
						state: "COMPLETED"
					}
				},
				"COMPLETED": {}
			}, "INITIALIZED")
		};

		own.machine.on("state:*", function(arguments) {
			emit.apply(self, arguments);
		});

		this.getState = function() {
			return machine.getState();
		};

		transport.open(options.method.toUpperCase(), locator, true);
		transport.setRequestHeader("X-BMS-Request-Token", token++);

//machine.restrict(this, "setHeader", ["INITIALIZED"]);
		this.setHeader = function() {
			transport.setRequestHeader.apply(transport, arguments);
			return this;
		};

		this.send = function(data) {
			own.machine.trigger("send", data);
			return this;
		};

		transport.onreadystatechange = function() {
			try {
				if(transport.readyState == 4) {
					own.response = {
						status: transport.status,
						data: transport.responseXML || transport.responseText,
						text: transport.responseText
					};
					own.machine.tick();
					own.emitter.emit("response", response);

					free();
				}
			}
			catch(exception) {
				emitter.emit("error", exception);

				free();
			}

			function free() {
				transport = null;
			}
		};

		this.getLocator = function() {
			return locator;
		};

		this.getResponse = function() {
			return own.response;
		};
	};

	return constructor;
})();