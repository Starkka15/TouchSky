/* A post in context: its ancestors above, the post itself highlighted, and the
	replies below (nested ones indented). Tapping a reply opens its own thread;
	a small stack remembers where to go back to. */
enyo.kind({
	name: "BS.Thread",
	kind: enyo.VFlexBox,
	className: "bs-feed",
	events: {
		onReply: "",
		onSave: "",
		onPick: "",
		onBack: ""
	},
	components: [
		{kind: "HFlexBox", align: "center", className: "bs-subbar", components: [
			{kind: "Button", caption: "‹ Back", className: "enyo-button-dark", onclick: "backClick"},
			{name: "title", className: "bs-subbar-title", flex: 1, content: "Thread"}
		]},
		{name: "note", className: "bs-feed-note", showing: false},
		{name: "scroller", kind: "Scroller", flex: 1, accelerated: false, components: [
			{name: "list"}
		]}
	],

	create: function() {
		this.inherited(arguments);
		this.stack = [];
		this.turn = 0;
	},

	// Open a fresh thread (clears the back stack).
	open: function(uri) {
		this.stack = [uri];
		this.load(uri);
	},

	// Drill into a reply's thread.
	push: function(uri) {
		this.stack.push(uri);
		this.load(uri);
	},

	backClick: function() {
		this.stack.pop();
		if (this.stack.length) {
			this.load(this.stack[this.stack.length - 1]);
		} else {
			this.doBack();
		}
	},

	load: function(uri) {
		var self = this;
		var turn = ++this.turn;
		this.$.list.destroyControls();
		if (this.$.list.hasNode()) { this.$.list.render(); }
		this.$.scroller.scrollTo(0, 0);
		this.showNote("Loading…");
		BS.Api.postThread(uri, function(error, data) {
			if (turn !== self.turn) { return; }
			if (error) { self.showNote(error === "signin" ? "Please sign in again." : error); return; }
			self.render(data.thread);
		});
	},

	showNote: function(text) {
		this.$.note.setContent(text || "");
		this.$.note.setShowing(!!text);
	},

	render: function(thread) {
		this.$.list.destroyControls();
		this.focused = null;
		if (!thread || !thread.post) { this.showNote("This post could not be found."); return; }

		// Ancestors, oldest first.
		var anc = [], p = thread.parent, guard = 0;
		while (p && p.post && guard++ < 25) { anc.push(p.post); p = p.parent; }
		anc.reverse();
		for (var i = 0; i < anc.length; i++) { this.addPost(anc[i], 0, false); }

		// The post itself.
		this.focused = this.addPost(thread.post, 0, true);

		// Replies, nested.
		this.addReplies(thread.replies, 1);

		if (this.$.list.hasNode()) { this.$.list.render(); }
		this.showNote("");
		this.scrollToFocused();
	},

	addReplies: function(replies, depth) {
		if (!replies || !replies.length) { return; }
		for (var i = 0; i < replies.length; i++) {
			var r = replies[i];
			if (!r || !r.post) { continue; }
			this.addPost(r.post, depth, false);
			this.addReplies(r.replies, depth + 1);
		}
	},

	addPost: function(post, depth, focused) {
		var row = this.$.list.createComponent({
			kind: "BS.Post", owner: this,
			onReply: "rowReply", onSave: "rowSave", onPick: "rowPick", onOpen: "rowOpen"
		});
		row.setItem({post: post});
		if (focused) { row.addClass("bs-post-focused"); }
		if (depth > 0) { row.applyStyle("margin-left", Math.min(depth, 6) * 16 + "px"); }
		return row;
	},

	// Put the focused post near the top so its replies are in view.
	scrollToFocused: function() {
		if (this.focused && this.focused.hasNode()) {
			var y = this.focused.node.offsetTop;
			this.$.scroller.scrollTo(Math.max(0, y - 8), 0);
		}
	},

	rowReply: function(inSender, post) { this.doReply(post); },
	rowSave: function(inSender, info) { this.doSave(info); },
	rowPick: function(inSender, handle) { this.doPick(handle); },
	rowOpen: function(inSender, uri) { if (uri) { this.push(uri); } }
});
