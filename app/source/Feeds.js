/* Your saved and pinned feeds. The list is read from the account's
	preferences; tapping one opens that feed's posts (reusing BS.Post). The home
	timeline shows as "Following". */
enyo.kind({
	name: "BS.Feeds",
	kind: enyo.VFlexBox,
	className: "bs-feed",
	events: {
		onReply: "",
		onSave: "",
		onPick: "",
		onOpen: ""
	},
	components: [
		{name: "inner", kind: "Pane", flex: 1, components: [
			{name: "listView", kind: "VFlexBox", components: [
				{name: "listNote", className: "bs-feed-note", showing: false},
				{name: "listScroller", kind: "Scroller", flex: 1, accelerated: false, components: [
					{name: "feedList"}
				]}
			]},
			{name: "postsView", kind: "VFlexBox", components: [
				{kind: "HFlexBox", align: "center", className: "bs-subbar", components: [
					{kind: "Button", caption: "‹ Feeds", className: "enyo-button-dark", onclick: "backToList"},
					{name: "feedTitle", className: "bs-subbar-title", flex: 1}
				]},
				{name: "postsNote", className: "bs-feed-note", showing: false},
				{name: "postsScroller", kind: "Scroller", flex: 1, accelerated: false,
					onScroll: "scrolledPosts", components: [
					{name: "postList"}
				]}
			]}
		]}
	],

	create: function() {
		this.inherited(arguments);
		this.loadedList = false;
		this.turn = 0;
		this.cursor = "";
		this.loading = false;
		this.more = true;
		this.source = null;
	},

	open: function() {
		this.$.inner.selectViewByName("listView");
		if (!this.loadedList) { this.loadList(); }
	},

	atPosts: function() {
		return this.$.inner.getViewName() === "postsView";
	},

	backToList: function() {
		this.turn++;    // stop any in-flight post load from rendering
		this.$.inner.selectViewByName("listView");
	},

	// ---- the list of feeds ----

	loadList: function() {
		var self = this;
		this.loadedList = true;
		this.$.listNote.setContent("Loading…");
		this.$.listNote.setShowing(true);
		BS.Api.preferences(function(error, data) {
			if (error) {
				self.$.listNote.setContent(error === "signin" ? "Please sign in again." : error);
				return;
			}
			var items = self.savedFeeds(data.preferences || []);
			var feedUris = [];
			for (var i = 0; i < items.length; i++) {
				if (items[i].type === "feed") { feedUris.push(items[i].value); }
			}
			if (feedUris.length) {
				BS.Api.feedGenerators(feedUris, function(e2, gens) {
					var map = {};
					var list = (gens && gens.feeds) || [];
					for (var j = 0; j < list.length; j++) { map[list[j].uri] = list[j]; }
					self.buildList(items, map);
				});
			} else {
				self.buildList(items, {});
			}
		});
	},

	// The saved-feeds preference, V2 or the older shape, pinned entries first.
	savedFeeds: function(prefs) {
		var items = [], i;
		for (i = 0; i < prefs.length; i++) {
			if (String(prefs[i].$type).indexOf("savedFeedsPrefV2") >= 0 && prefs[i].items) {
				items = prefs[i].items.slice(0);
				break;
			}
		}
		if (!items.length) {
			for (i = 0; i < prefs.length; i++) {
				if (String(prefs[i].$type).indexOf("savedFeedsPref") >= 0) {
					var pinned = prefs[i].pinned || [], saved = prefs[i].saved || [], k;
					for (k = 0; k < pinned.length; k++) { items.push({type: "feed", value: pinned[k], pinned: true}); }
					for (k = 0; k < saved.length; k++) {
						if (pinned.indexOf(saved[k]) < 0) { items.push({type: "feed", value: saved[k], pinned: false}); }
					}
					break;
				}
			}
		}
		// Pinned first, order otherwise kept.
		var pin = [], rest = [];
		for (i = 0; i < items.length; i++) { (items[i].pinned ? pin : rest).push(items[i]); }
		return pin.concat(rest);
	},

	buildList: function(items, map) {
		this.$.feedList.destroyControls();
		var pending = [];
		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			var entry = null;
			if (it.type === "timeline") {
				entry = {type: "timeline", name: "Following", desc: "Your home timeline"};
			} else if (it.type === "feed") {
				var g = map[it.value] || {};
				entry = {type: "feed", value: it.value, name: g.displayName || "Feed",
					avatar: g.avatar || "", desc: g.description || ""};
			} else if (it.type === "list") {
				entry = {type: "list", value: it.value, name: "List", desc: ""};
			}
			if (entry) { this.addFeedRow(entry, pending); }
		}
		if (this.$.feedList.hasNode()) { this.$.feedList.render(); }
		BS.fillEmoji(pending);
		var empty = !this.$.feedList.getControls().length;
		this.$.listNote.setContent(empty ? "No saved feeds." : "");
		this.$.listNote.setShowing(empty);
	},

	addFeedRow: function(entry, pending) {
		var name = BS.emojiHtml(entry.name);
		pending.push.apply(pending, name.list);
		var descHtml = "";
		if (entry.desc) {
			var d = BS.emojiHtml(String(entry.desc).replace(/\n+/g, " "));
			pending.push.apply(pending, d.list);
			descHtml = "<div class='bs-actor-bio'>" + d.html + "</div>";
		}
		var row = this.$.feedList.createComponent({
			kind: "HFlexBox", className: "bs-notif", entry: entry, onclick: "feedTap", owner: this,
			components: [
				{className: "bs-notif-avatar bs-feed-icon"},
				{flex: 1, allowHtml: true, content: "<span class='bs-name'>" + name.html + "</span>" + descHtml}
			]
		});
		// The row's children are owned by this view, so take the avatar by position.
		BS.bg(row.getControls()[0], BS.avatarThumb(entry.avatar));
	},

	feedTap: function(inSender) {
		this.openFeed(inSender.entry);
	},

	// ---- one feed's posts ----

	openFeed: function(entry) {
		this.source = entry;
		this.$.feedTitle.setContent(BS.escape(entry.name));
		this.$.inner.selectViewByName("postsView");
		this.cursor = "";
		this.more = true;
		this.$.postList.destroyControls();
		if (this.$.postList.hasNode()) { this.$.postList.render(); }
		this.$.postsScroller.scrollTo(0, 0);
		this.loadPosts(false);
	},

	loadPosts: function(append) {
		var self = this;
		var turn = append ? this.turn : (++this.turn);
		this.loading = true;
		if (!append) {
			this.$.postsNote.setContent("Loading…");
			this.$.postsNote.setShowing(true);
		}
		var cb = function(error, data) {
			if (turn !== self.turn) { return; }
			self.loading = false;
			if (error) {
				self.$.postsNote.setContent(error === "signin" ? "Please sign in again." : error);
				self.$.postsNote.setShowing(true);
				return;
			}
			self.cursor = data.cursor || "";
			self.more = !!data.cursor;
			self.showPosts(data.feed || [], append);
		};
		var s = this.source;
		if (s.type === "timeline") { BS.Api.timeline(this.cursor, cb); }
		else if (s.type === "list") { BS.Api.listFeed(s.value, this.cursor, cb); }
		else { BS.Api.feed(s.value, this.cursor, cb); }
	},

	showPosts: function(items, append) {
		if (!append) { this.$.postList.destroyControls(); this.seen = {}; }
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			var post = item && item.post;
			if (!post || !post.uri || this.seen[post.uri]) { continue; }
			this.seen[post.uri] = true;
			var row = this.$.postList.createComponent({
				kind: "BS.Post", owner: this,
				onReply: "rowReply", onSave: "rowSave", onPick: "rowPick", onOpen: "rowOpen"
			});
			row.setItem(item);
		}
		if (this.$.postList.hasNode()) { this.$.postList.render(); }
		var empty = !this.$.postList.getControls().length;
		this.$.postsNote.setContent(empty ? "Nothing in this feed yet." : "");
		this.$.postsNote.setShowing(empty);
	},

	loadMorePosts: function() {
		if (this.loading || !this.more || !this.cursor) { return; }
		this.loadPosts(true);
	},

	rowReply: function(inSender, post) { this.doReply(post); },
	rowSave: function(inSender, info) { this.doSave(info); },
	rowPick: function(inSender, handle) { this.doPick(handle); },
	rowOpen: function(inSender, uri) { this.doOpen(uri); },

	scrolledPosts: function() {
		if (!this.$.postList.getControls().length) { return; }
		var sc = this.$.postsScroller;
		var b = sc.getBoundaries();
		if (b && (b.bottom - (sc.scrollTop || 0)) < 800) { this.loadMorePosts(); }
	}
});
