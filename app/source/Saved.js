/* Saved posts (bookmarks), kept on the tablet. Rebuilt from storage each time
	it is opened, newest first. */
enyo.kind({
	name: "BS.Saved",
	kind: enyo.VFlexBox,
	className: "bs-feed",
	events: {
		onReply: "",
		onSave: "",
		onPick: "",
		onOpen: ""
	},
	components: [
		{name: "note", className: "bs-feed-note", showing: false},
		{name: "scroller", kind: "Scroller", flex: 1, accelerated: false, components: [
			{name: "list"}
		]}
	],

	open: function() {
		this.load();
	},

	load: function() {
		this.$.list.destroyControls();
		var saved = BS.saved();
		for (var i = 0; i < saved.length; i++) {
			if (!saved[i] || !saved[i].uri) { continue; }
			var row = this.$.list.createComponent({
				kind: "BS.Post", owner: this,
				onReply: "rowReply", onSave: "rowSave", onPick: "rowPick", onOpen: "rowOpen"
			});
			row.setItem({post: saved[i]});
		}
		if (this.$.list.hasNode()) { this.$.list.render(); }
		this.$.scroller.scrollTo(0, 0);
		var empty = !this.$.list.getControls().length;
		this.$.note.setContent(empty ? "No saved posts yet. Tap Save on a post." : "");
		this.$.note.setShowing(empty);
	},

	rowReply: function(inSender, post) { this.doReply(post); },
	rowSave: function(inSender, info) { this.doSave(info); },
	rowPick: function(inSender, handle) { this.doPick(handle); },
	rowOpen: function(inSender, uri) { this.doOpen(uri); }
});
