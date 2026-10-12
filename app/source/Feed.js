/* A scrolling wall of posts. The App hands it feed items; it makes a BS.Post
	for each, and asks for more when the bottom comes near. */
enyo.kind({
	name: "BS.Feed",
	kind: enyo.VFlexBox,
	className: "bs-feed",
	events: {
		onReply: "",
		onSave: "",
		onPick: "",
		onOpen: "",
		onNeedMore: ""
	},
	components: [
		{name: "note", className: "bs-feed-note", showing: false},
		// Not accelerated: the transform-based scroll path layers the whole feed
		// and has hung this GPU. Plain positioning is slower but safe.
		{name: "scroller", kind: "Scroller", flex: 1, accelerated: false, onScroll: "scrolled", components: [
			{name: "list"}
		]}
	],

	create: function() {
		this.inherited(arguments);
		this.seen = {};
	},

	showNote: function(text) {
		this.$.note.setContent(text || "");
		this.$.note.setShowing(!!text);
	},

	// Replace everything.
	setItems: function(items) {
		this.$.list.destroyControls();
		this.seen = {};
		this.$.scroller.scrollTo(0, 0);
		this.append(items);
	},

	// Add more below, skipping anything already shown.
	append: function(items) {
		items = items || [];
		var added = 0;
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			var post = item && item.post;
			if (!post || !post.uri) { continue; }
			// A repost and the original can both appear; key on both.
			var key = post.uri + "|" + ((item.reason && item.reason.by && item.reason.by.did) || "");
			if (this.seen[key]) { continue; }
			this.seen[key] = true;
			var row = this.$.list.createComponent({
				kind: "BS.Post", owner: this,
				onReply: "rowReply", onSave: "rowSave", onPick: "rowPick", onOpen: "rowOpen"
			});
			row.setItem(item);
			added++;
		}
		if (this.$.list.hasNode()) { this.$.list.render(); }
		this.showNote(this.$.list.getControls().length ? "" : "Nothing here yet.");
		return added;
	},

	rowReply: function(inSender, post) { this.doReply(post); },
	rowSave: function(inSender, info) { this.doSave(info); },
	rowPick: function(inSender, handle) { this.doPick(handle); },
	rowOpen: function(inSender, uri) { this.doOpen(uri); },

	scrolled: function() {
		if (!this.$.list.getControls().length) { return; }
		var sc = this.$.scroller;
		var b = sc.getBoundaries();
		// scrollTop is the live position; b.bottom is as far down as it goes.
		if (b && (b.bottom - (sc.scrollTop || 0)) < 800) {
			this.doNeedMore();
		}
	},

	toTop: function() {
		this.$.scroller.scrollTo(0, 0);
	}
});
