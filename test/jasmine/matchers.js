beforeEach(function() {
	this.addMatchers({
		toBeInstanceOf: function(type) {
			return this.actual instanceof type;
		},

		toThrowException: function(type) {
			try {
				this.actual();
				return false;
			}
			catch(exception) {
				return !arguments.length || (exception.constructor === type);
			}
		}
	});
});