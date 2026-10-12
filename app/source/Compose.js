/* Writing a post, as a full-screen view (not a modal: a 0x0 ModalDialog is what
	froze/hid here). show() for a new post, replyTo(post) to answer one. Emits
	onPosted when it goes through, onCancel to back out. */
enyo.kind({
	name: "BS.Compose",
	kind: enyo.VFlexBox,
	className: "bs-compose",
	events: {
		onPosted: "",
		onCancel: ""
	},
	components: [
		{kind: "HFlexBox", align: "center", className: "bs-compose-bar", components: [
			{name: "title", content: "New Post", className: "bs-compose-title", flex: 1},
			{kind: "Button", caption: "Cancel", className: "bs-bar-btn", onclick: "cancelClick"},
			{name: "post", kind: "Button", caption: "Post", className: "enyo-button-blue bs-bar-btn",
				onclick: "postClick"}
		]},
		{name: "replyTo", className: "bs-compose-replyto", allowHtml: true, showing: false},
		{name: "text", kind: "RichText", flex: 1, className: "bs-compose-text",
			autoCapitalize: "sentences", onkeyup: "typed"},
		{name: "count", className: "bs-compose-count"}
	],

	LIMIT: 300,

	show: function() {
		this.reply = null;
		this.$.replyTo.setShowing(false);
		this.$.text.setValue("");
		this.$.title.setContent("New Post");
		this.ready();
		enyo.asyncMethod(this, "focus");
	},

	replyTo: function(post) {
		post = post || {};
		var author = post.author || {};
		var rec = post.record || {};
		var parent = {uri: post.uri, cid: post.cid};
		var root = (rec.reply && rec.reply.root) ? rec.reply.root : parent;
		this.reply = {root: root, parent: parent};
		this.$.replyTo.setContent("Replying to <b>" + BS.escape(author.displayName || author.handle || "") + "</b>");
		this.$.replyTo.setShowing(true);
		this.$.text.setValue("");
		this.$.title.setContent("Reply");
		this.ready();
		enyo.asyncMethod(this, "focus");
	},

	focus: function() {
		try { this.$.text.forceFocus(); } catch (e) {}
	},

	typed: function() {
		this.ready();
	},

	ready: function() {
		var left = this.LIMIT - this.length();
		this.$.count.setContent(left + " left");
		this.$.count.addRemoveClass("bs-over", left < 0);
		this.$.post.setDisabled(left < 0 || this.length() === 0 || this.sending);
	},

	length: function() {
		return String(this.$.text.getValue() || "").replace(/^\s+|\s+$/g, "").length;
	},

	postClick: function() {
		var self = this;
		var text = String(this.$.text.getValue() || "").replace(/\s+$/g, "");
		if (!text || this.sending) { return; }
		this.sending = true;
		this.$.post.setDisabled(true);
		this.$.post.setCaption("Posting…");
		BS.Api.post(text, this.reply, function(error) {
			self.sending = false;
			self.$.post.setCaption("Post");
			if (error) {
				self.ready();
				BS.banner(error);
				return;
			}
			BS.banner(self.reply ? "Reply posted" : "Posted");
			self.$.text.setValue("");
			self.doPosted();
		});
	},

	cancelClick: function() {
		this.doCancel();
	}
});
