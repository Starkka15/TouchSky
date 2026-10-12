/* The notifications list: who liked, reposted, followed, replied, mentioned or
	quoted. Loads itself and pages as it is scrolled. Tapping one opens that
	person's profile. */
enyo.kind({
	name: "BS.Notifications",
	kind: enyo.VFlexBox,
	className: "bs-feed",
	events: {
		onPick: ""        // (this, handleOrDid)
	},
	components: [
		{name: "note", className: "bs-feed-note", showing: false},
		{name: "scroller", kind: "Scroller", flex: 1, accelerated: false, onScroll: "scrolled", components: [
			{name: "list"}
		]}
	],

	PHRASES: {
		like: "liked your post",
		repost: "reposted your post",
		follow: "followed you",
		mention: "mentioned you",
		reply: "replied to you",
		quote: "quoted your post"
	},

	create: function() {
		this.inherited(arguments);
		this.cursor = "";
		this.loading = false;
		this.more = true;
		this.turn = 0;
		this.loaded = false;
	},

	showNote: function(text) {
		this.$.note.setContent(text || "");
		this.$.note.setShowing(!!text);
	},

	// Called when the screen is opened. Loads once, then only on manual refresh.
	open: function() {
		if (!this.loaded) { this.refresh(); }
	},

	refresh: function() {
		var self = this;
		var turn = ++this.turn;
		this.loaded = true;
		this.cursor = "";
		this.more = true;
		this.loading = true;
		this.$.list.destroyControls();
		if (this.$.list.hasNode()) { this.$.list.render(); }
		this.$.scroller.scrollTo(0, 0);
		this.showNote("Loading…");
		BS.Api.notifications("", function(error, data) {
			if (turn !== self.turn) { return; }
			self.loading = false;
			if (error) { self.showNote(error === "signin" ? "Please sign in again." : error); return; }
			self.cursor = data.cursor || "";
			self.more = !!data.cursor;
			self.showRows(data.notifications || [], false);
			BS.Api.markSeen();
		});
	},

	loadMore: function() {
		var self = this;
		if (this.loading || !this.more || !this.cursor) { return; }
		var turn = this.turn;
		this.loading = true;
		BS.Api.notifications(this.cursor, function(error, data) {
			if (turn !== self.turn) { return; }
			self.loading = false;
			if (error) { return; }
			self.cursor = data.cursor || "";
			self.more = !!data.cursor;
			self.showRows(data.notifications || [], true);
		});
	},

	showRows: function(list, append) {
		if (!append) { this.$.list.destroyControls(); }
		var pending = [];
		for (var i = 0; i < list.length; i++) {
			this.addRow(list[i], pending);
		}
		if (this.$.list.hasNode()) { this.$.list.render(); }
		BS.fillEmoji(pending);
		this.showNote(this.$.list.getControls().length ? "" : "No notifications yet.");
	},

	addRow: function(n, pending) {
		var author = n.author || {};
		var phrase = this.PHRASES[n.reason] || n.reason;
		var nameHtml = BS.emojiHtml(author.displayName || author.handle || "");
		pending.push.apply(pending, nameHtml.list);
		// For replies, mentions and quotes, show what they wrote.
		var body = "";
		if ((n.reason === "reply" || n.reason === "mention" || n.reason === "quote") && n.record && n.record.text) {
			var t = BS.emojiHtml(n.record.text);
			pending.push.apply(pending, t.list);
			body = "<div class='bs-notif-body'>" + t.html + "</div>";
		}
		var row = this.$.list.createComponent({
			kind: "HFlexBox", className: "bs-notif", handle: author.did || author.handle,
			onclick: "rowTap", owner: this,
			components: [
				{className: "bs-notif-avatar"},
				{allowHtml: true, flex: 1, content:
					"<span class='bs-name'>" + nameHtml.html + "</span> " +
					"<span class='bs-notif-reason'>" + BS.escape(phrase) + "</span>" +
					"<span class='bs-time'> · " + BS.timeAgo(n.indexedAt) + "</span>" + body}
			]
		});
		BS.bg(row.getControls()[0], BS.avatarThumb(author.avatar));
	},

	rowTap: function(inSender) {
		if (inSender.handle) { this.doPick(inSender.handle); }
	},

	scrolled: function() {
		if (!this.$.list.getControls().length) { return; }
		var sc = this.$.scroller;
		var b = sc.getBoundaries();
		if (b && (b.bottom - (sc.scrollTop || 0)) < 800) { this.loadMore(); }
	},

	toTop: function() {
		this.$.scroller.scrollTo(0, 0);
	}
});
