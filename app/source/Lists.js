/* Your lists. Tapping one shows its feed (reusing BS.Post). */
enyo.kind({
	name: "BS.Lists",
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
					{name: "theList"}
				]}
			]},
			{name: "postsView", kind: "VFlexBox", components: [
				{kind: "HFlexBox", align: "center", className: "bs-subbar", components: [
					{kind: "Button", caption: "‹ Lists", className: "enyo-button-dark", onclick: "backToList"},
					{name: "title", className: "bs-subbar-title", flex: 1}
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
		this.turn++;
		this.$.inner.selectViewByName("listView");
	},

	loadList: function() {
		var self = this;
		this.loadedList = true;
		this.$.listNote.setContent("Loading…");
		this.$.listNote.setShowing(true);
		var did = (BS.session() || {}).did;
		BS.Api.lists(did, "", function(error, data) {
			if (error) {
				self.$.listNote.setContent(error === "signin" ? "Please sign in again." : error);
				return;
			}
			self.buildList(data.lists || []);
		});
	},

	buildList: function(lists) {
		this.$.theList.destroyControls();
		var pending = [];
		for (var i = 0; i < lists.length; i++) {
			this.addListRow(lists[i], pending);
		}
		if (this.$.theList.hasNode()) { this.$.theList.render(); }
		BS.fillEmoji(pending);
		var empty = !this.$.theList.getControls().length;
		this.$.listNote.setContent(empty ? "You have no lists." : "");
		this.$.listNote.setShowing(empty);
	},

	addListRow: function(list, pending) {
		var name = BS.emojiHtml(list.name || "List");
		pending.push.apply(pending, name.list);
		var body = "";
		if (list.description) {
			var d = BS.emojiHtml(String(list.description).replace(/\n+/g, " "));
			pending.push.apply(pending, d.list);
			body += "<div class='bs-actor-bio'>" + d.html + "</div>";
		}
		if (list.listItemCount !== undefined) {
			body += "<div class='bs-actor-bio'>" + BS.count(list.listItemCount) + " members</div>";
		}
		var row = this.$.theList.createComponent({
			kind: "HFlexBox", className: "bs-notif", listuri: list.uri, listname: list.name || "List",
			onclick: "listTap", owner: this,
			components: [
				{className: "bs-notif-avatar bs-feed-icon"},
				{flex: 1, allowHtml: true, content: "<span class='bs-name'>" + name.html + "</span>" + body}
			]
		});
		BS.bg(row.getControls()[0], BS.avatarThumb(list.avatar));
	},

	listTap: function(inSender) {
		this.openList(inSender.listuri, inSender.listname);
	},

	openList: function(uri, name) {
		this.source = uri;
		this.$.title.setContent(BS.escape(name));
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
		BS.Api.listFeed(this.source, this.cursor, function(error, data) {
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
		});
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
		this.$.postsNote.setContent(empty ? "Nothing in this list yet." : "");
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
