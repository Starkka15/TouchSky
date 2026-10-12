/* A profile: banner, avatar, name, bio and counts, then that person's posts.
	Works for anyone (your own via the rail, others by tapping a name). Reuses
	BS.Post for the posts and bubbles their reply / save / pick up. */
enyo.kind({
	name: "BS.Profile",
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
		{name: "scroller", kind: "Scroller", flex: 1, accelerated: false, onScroll: "scrolled", components: [
			{name: "inner", components: [
				{name: "banner", className: "bs-prof-banner"},
				{className: "bs-prof-head", components: [
					{kind: "HFlexBox", align: "center", components: [
						{name: "avatar", className: "bs-prof-avatar"},
						{flex: 1},
						{name: "follow", kind: "Button", className: "enyo-button-blue bs-prof-follow",
							showing: false, onclick: "followClick"}
					]},
					{name: "name", className: "bs-prof-name", allowHtml: true},
					{name: "handle", className: "bs-prof-handle"},
					{name: "bio", className: "bs-prof-bio", allowHtml: true, showing: false},
					{name: "counts", className: "bs-prof-counts"}
				]},
				{name: "list"}
			]}
		]}
	],

	create: function() {
		this.inherited(arguments);
		this.actor = "";
		this.cursor = "";
		this.loading = false;
		this.more = true;
		this.turn = 0;
	},

	showNote: function(text) {
		this.$.note.setContent(text || "");
		this.$.note.setShowing(!!text);
	},

	// Open on a given person (did or handle).
	open: function(actor) {
		if (actor && actor !== this.actor) { this.load(actor); }
	},

	load: function(actor) {
		var self = this;
		var turn = ++this.turn;
		this.actor = actor;
		this.cursor = "";
		this.more = true;
		this.loading = true;
		this.seen = {};
		this.$.list.destroyControls();
		this.clearHeader();
		if (this.$.inner.hasNode()) { this.$.inner.render(); }
		this.$.scroller.scrollTo(0, 0);
		this.showNote("Loading…");

		BS.Api.profile(actor, function(error, me) {
			if (turn !== self.turn) { return; }
			if (error) { self.showNote(error === "signin" ? "Please sign in again." : error); return; }
			self.showHeader(me);
		});
		BS.Api.authorFeed(actor, "", function(error, data) {
			if (turn !== self.turn) { return; }
			self.loading = false;
			if (error) { self.showNote(error === "signin" ? "Please sign in again." : error); return; }
			self.cursor = data.cursor || "";
			self.more = !!data.cursor;
			self.showRows(data.feed || [], false);
		});
	},

	clearHeader: function() {
		this.$.banner.applyStyle("background-image", "none");
		this.$.avatar.applyStyle("background-image", "none");
		this.$.name.setContent("");
		this.$.handle.setContent("");
		this.$.bio.setContent("");
		this.$.bio.setShowing(false);
		this.$.counts.setContent("");
	},

	showHeader: function(p) {
		p = p || {};
		BS.bg(this.$.banner, p.banner);
		BS.bg(this.$.avatar, p.avatar);
		// Follow button, only on other people's profiles.
		this.profileDid = p.did || "";
		this.followUri = (p.viewer && p.viewer.following) || "";
		this.followBusy = false;
		var mine = (BS.session() || {}).did;
		if (p.did && p.did !== mine) {
			this.$.follow.setShowing(true);
			this.updateFollow();
		} else {
			this.$.follow.setShowing(false);
		}
		var pending = [];
		var name = BS.emojiHtml(p.displayName || p.handle || "");
		pending.push.apply(pending, name.list);
		this.$.name.setContent(name.html);
		this.$.handle.setContent("@" + BS.escape(p.handle || ""));
		if (p.description) {
			var bio = BS.emojiHtml(p.description);
			pending.push.apply(pending, bio.list);
			this.$.bio.setContent(bio.html);
			this.$.bio.setShowing(true);
		}
		this.$.counts.setContent(
			BS.count(p.followersCount) + " followers · " +
			BS.count(p.followsCount) + " following · " +
			BS.count(p.postsCount) + " posts");
		if (this.$.inner.hasNode()) { this.$.inner.render(); }
		BS.fillEmoji(pending);
	},

	updateFollow: function() {
		this.$.follow.setCaption(this.followUri ? "Following" : "Follow");
		this.$.follow.setClassName("enyo-button-" + (this.followUri ? "dark" : "blue") + " bs-prof-follow");
	},

	followClick: function() {
		var self = this;
		if (this.followBusy || !this.profileDid) { return; }
		this.followBusy = true;
		if (this.followUri) {
			var uri = this.followUri;
			this.followUri = "";
			this.updateFollow();
			BS.Api.unfollow(uri, function(error) {
				self.followBusy = false;
				if (error) { self.followUri = uri; self.updateFollow(); BS.banner(error); }
			});
		} else {
			this.followUri = "pending";
			this.updateFollow();
			BS.Api.follow(this.profileDid, function(error, data) {
				self.followBusy = false;
				if (error) { self.followUri = ""; self.updateFollow(); BS.banner(error); }
				else { self.followUri = (data && data.uri) || ""; self.updateFollow(); }
			});
		}
	},

	showRows: function(items, append) {
		if (!append) { this.$.list.destroyControls(); this.seen = {}; }
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			var post = item && item.post;
			if (!post || !post.uri || this.seen[post.uri]) { continue; }
			this.seen[post.uri] = true;
			var row = this.$.list.createComponent({
				kind: "BS.Post", owner: this,
				onReply: "rowReply", onSave: "rowSave", onPick: "rowPick", onOpen: "rowOpen"
			});
			row.setItem(item);
		}
		if (this.$.list.hasNode()) { this.$.list.render(); }
		this.showNote(this.$.list.getControls().length ? "" : "No posts yet.");
	},

	loadMore: function() {
		var self = this;
		if (this.loading || !this.more || !this.cursor) { return; }
		var turn = this.turn;
		this.loading = true;
		BS.Api.authorFeed(this.actor, this.cursor, function(error, data) {
			if (turn !== self.turn) { return; }
			self.loading = false;
			if (error) { return; }
			self.cursor = data.cursor || "";
			self.more = !!data.cursor;
			self.showRows(data.feed || [], true);
		});
	},

	rowReply: function(inSender, post) { this.doReply(post); },
	rowSave: function(inSender, info) { this.doSave(info); },
	rowPick: function(inSender, handle) { this.doPick(handle); },
	rowOpen: function(inSender, uri) { this.doOpen(uri); },

	scrolled: function() {
		var sc = this.$.scroller;
		var b = sc.getBoundaries();
		if (b && (b.bottom - (sc.scrollTop || 0)) < 800) { this.loadMore(); }
	},

	toTop: function() {
		this.$.scroller.scrollTo(0, 0);
	}
});
