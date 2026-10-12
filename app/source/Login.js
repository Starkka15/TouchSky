/* The sign-in screen: a handle and an app password. Emits onDone when a
	session is in hand. */
enyo.kind({
	name: "BS.Login",
	kind: enyo.VFlexBox,
	className: "bs-login",
	events: {
		onDone: ""
	},
	components: [
		{kind: "Scroller", flex: 1, components: [
			{className: "bs-login-box", components: [
				{content: "TouchSky", className: "bs-login-title"},
				{content: "Sign in with an app password, not your main one. Make one at Settings &rarr; Privacy and Security &rarr; App Passwords on bsky.app.",
					allowHtml: true, className: "bs-login-help"},

				{content: "Handle or email", className: "bs-login-label"},
				{name: "id", kind: "Input", className: "bs-login-input", hint: "you.bsky.social",
					autoCapitalize: "lowercase", autocorrect: false, spellcheck: false, onkeydown: "keyDown"},

				{content: "App password", className: "bs-login-label"},
				{name: "pw", kind: "PasswordInput", className: "bs-login-input", hint: "xxxx-xxxx-xxxx-xxxx",
					autoCapitalize: "lowercase", autocorrect: false, spellcheck: false, onkeydown: "keyDown"},

				{name: "problem", className: "bs-login-problem", showing: false},

				{name: "signin", kind: "Button", caption: "Sign In", className: "enyo-button-blue bs-login-button",
					onclick: "signInClick"}
			]}
		]}
	],

	keyDown: function(inSender, inEvent) {
		if (inEvent.keyCode === 13) {
			this.signInClick();
		}
	},

	showProblem: function(text) {
		this.$.problem.setContent(text || "");
		this.$.problem.setShowing(!!text);
	},

	busy: function(on) {
		this.$.signin.setDisabled(on);
		this.$.signin.setCaption(on ? "Signing in…" : "Sign In");
	},

	signInClick: function() {
		var self = this;
		var id = String(this.$.id.getValue() || "").replace(/^\s+|\s+$/g, "");
		var pw = String(this.$.pw.getValue() || "").replace(/^\s+|\s+$/g, "");
		if (!id || !pw) {
			this.showProblem("Fill in both a handle and an app password.");
			return;
		}
		this.showProblem("");
		this.busy(true);
		BS.Api.login(id, pw, function(error) {
			self.busy(false);
			if (error) {
				self.showProblem(error);
				return;
			}
			self.$.pw.setValue("");
			self.doDone();
		});
	},

	// Start fresh when shown again.
	reset: function() {
		this.$.pw.setValue("");
		this.showProblem("");
		this.busy(false);
	}
});
