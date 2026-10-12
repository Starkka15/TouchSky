/* The app: sign in, then a Bluesky-style left rail (Home, Explore, and the
	rest) beside the content. Home is the feed; New Post and Settings work;
	the other sections are placeholders until each is built. */

// The rail, top to bottom. Sections without a screen yet show "coming soon".
BS.NAV = [
	{section: "home", label: "Home"},
	{section: "explore", label: "Explore"},
	{section: "notifications", label: "Notifications"},
	{section: "chat", label: "Chat"},
	{section: "feeds", label: "Feeds"},
	{section: "lists", label: "Lists"},
	{section: "saved", label: "Saved"},
	{section: "profile", label: "Profile"},
	{section: "settings", label: "Settings"}
];

enyo.kind({
	name: "BS.App",
	kind: enyo.VFlexBox,
	className: "bs-app",
	components: [
		{kind: "ApplicationEvents", onBack: "backGesture"},
		{name: "saveSvc", kind: "PalmService", service: "palm://com.stark.bluesky.service/",
			method: "save", onResponse: "saved"},
		{name: "videoSvc", kind: "PalmService", service: "palm://com.stark.bluesky.service/",
			method: "video", onResponse: "videoReady"},
		{name: "pingSvc", kind: "PalmService", service: "palm://com.stark.bluesky.service/", method: "ping"},
		{name: "appMgr", kind: "PalmService", service: "palm://com.palm.applicationManager/", method: "launch"},
		{name: "atlasSvc", kind: "PalmService", service: "palm://com.palm.applicationManager/",
			method: "launch", onResponse: "atlasResult"},
		{name: "opener", kind: "PalmService", service: "palm://com.palm.applicationManager/", method: "open"},
		{name: "videoLayer", className: "bs-videolayer", showing: false, components: [
			{kind: "Button", caption: "Close", className: "bs-video-close", onclick: "closeVideo"},
			{name: "videoBox", kind: "HFlexBox", align: "center", pack: "center",
				className: "bs-videobox", allowHtml: true}
		]},

		{name: "pane", kind: "Pane", flex: 1, transitionKind: "enyo.transitions.Simple", components: [
			{name: "login", kind: "BS.Login", onDone: "loggedIn"},
			{name: "compose", kind: "BS.Compose", onPosted: "posted", onCancel: "composeCancel"},

			{name: "main", kind: "HFlexBox", components: [
				// ---- left rail ----
				{name: "rail", kind: "VFlexBox", className: "bs-rail", components: [
					{name: "meAvatar", className: "bs-rail-avatar", section: "profile", onclick: "railTap"},
					{name: "nav", kind: "VFlexBox", flex: 1},
					{kind: "Button", caption: "New Post", className: "enyo-button-blue bs-rail-new",
						onclick: "composeClick"}
				]},
				// ---- content ----
				{name: "content", kind: "Pane", flex: 1, transitionKind: "enyo.transitions.Simple", components: [
					{name: "feed", kind: "BS.Feed", onReply: "reply", onSave: "saveImage",
						onPick: "pick", onOpen: "openThread", onNeedMore: "needMore"},
					{name: "notifications", kind: "BS.Notifications", onPick: "pick"},
					{name: "profile", kind: "BS.Profile", onReply: "reply", onSave: "saveImage",
						onPick: "pick", onOpen: "openThread"},
					{name: "explore", kind: "BS.Explore", onReply: "reply", onSave: "saveImage",
						onPick: "pick", onOpen: "openThread"},
					{name: "feeds", kind: "BS.Feeds", onReply: "reply", onSave: "saveImage",
						onPick: "pick", onOpen: "openThread"},
					{name: "lists", kind: "BS.Lists", onReply: "reply", onSave: "saveImage",
						onPick: "pick", onOpen: "openThread"},
					{name: "chat", kind: "BS.Chat", onPick: "pick"},
					{name: "feedsaved", kind: "BS.Saved", onReply: "reply", onSave: "saveImage",
						onPick: "pick", onOpen: "openThread"},
					{name: "thread", kind: "BS.Thread", onReply: "reply", onSave: "saveImage",
						onPick: "pick", onBack: "threadBack"},
					{name: "placeholder", kind: "VFlexBox", align: "center", pack: "center",
						className: "bs-placeholder", components: [
						{name: "phNote", className: "bs-placeholder-note"}
					]},
					{name: "settings", kind: "VFlexBox", className: "bs-settings", components: [
						{content: "Settings", className: "bs-settings-title"},
						{name: "who", className: "bs-settings-who"},
						{kind: "Button", caption: "Sign Out", className: "enyo-button-negative bs-settings-btn",
							onclick: "signOut"}
					]}
				]}
			]}
		]},

		{kind: "AppMenu", lazy: false, components: [
			{caption: "Refresh", onclick: "refreshClick"},
			{caption: "Sign Out", onclick: "signOut"}
		]}
	],

	create: function() {
		this.inherited(arguments);
		this.cursor = "";
		this.loading = false;
		this.more = true;
		this.turn = 0;
		this.section = "home";
	},

	rendered: function() {
		this.inherited(arguments);
		if (this.begun) { return; }
		this.begun = true;
		var self = this;
		BS.videoHandler = function(url) { self.playVideo(url); };
		BS.linkHandler = function(url) { self.openLink(url); };
		this.buildNav();
		if (BS.loggedIn()) {
			this.start();
		} else {
			this.$.pane.selectViewByName("login");
		}
	},

	buildNav: function() {
		var n = this.$.nav;
		for (var i = 0; i < BS.NAV.length; i++) {
			n.createComponent({
				className: "bs-rail-item", section: BS.NAV[i].section,
				content: BS.NAV[i].label, onclick: "railTap", owner: this
			});
		}
		if (n.hasNode()) { n.render(); }
	},

	// After sign-in: show the feed, load it, and fetch our own avatar for the rail.
	start: function() {
		this.$.pane.selectViewByName("main");
		this.goTo("home");
		this.refresh();
		this.loadMe();
	},

	loggedIn: function() {
		this.start();
	},

	loadMe: function() {
		var self = this;
		var s = BS.session();
		if (!s || !s.did) { return; }
		BS.Api.profile(s.did, function(error, me) {
			if (error || !me) { return; }
			BS.me = me;
			if (me.avatar) {
				BS.imgLoad(BS.avatarThumb(me.avatar), function(data) {
					if (data) { self.$.meAvatar.applyStyle("background-image", "url(" + data + ")"); }
				});
			}
			self.$.who.setContent("Signed in as " +
				BS.escape(me.displayName || me.handle || s.handle || "") +
				" (@" + BS.escape(me.handle || s.handle || "") + ")");
		});
	},

	// ---- rail ----

	railTap: function(inSender) {
		this.goTo(inSender.section);
	},

	goTo: function(section) {
		var already = this.section === section;
		this.section = section;
		// Highlight the active item.
		var items = this.$.nav.getControls();
		for (var i = 0; i < items.length; i++) {
			items[i].addRemoveClass("bs-rail-on", items[i].section === section);
		}
		if (section === "home") {
			this.$.content.selectViewByName("feed");
			if (already) { this.refreshClick(); }
		} else if (section === "notifications") {
			this.$.content.selectViewByName("notifications");
			if (already) { this.$.notifications.toTop(); this.$.notifications.refresh(); }
			else { this.$.notifications.open(); }
		} else if (section === "explore") {
			this.$.content.selectViewByName("explore");
			this.$.explore.open();
		} else if (section === "feeds") {
			this.$.content.selectViewByName("feeds");
			this.$.feeds.open();
		} else if (section === "lists") {
			this.$.content.selectViewByName("lists");
			this.$.lists.open();
		} else if (section === "chat") {
			this.$.content.selectViewByName("chat");
			this.$.chat.open();
		} else if (section === "profile") {
			this.$.content.selectViewByName("profile");
			var did = (BS.session() || {}).did;
			if (did) { this.$.profile.open(did); }
		} else if (section === "saved") {
			this.$.content.selectViewByName("feedsaved");
			this.$.feedsaved.open();
		} else if (section === "settings") {
			this.$.content.selectViewByName("settings");
		} else {
			var label = section.charAt(0).toUpperCase() + section.substring(1);
			this.$.phNote.setContent(label + " isn't built yet — coming soon.");
			this.$.content.selectViewByName("placeholder");
		}
	},

	// Tapping a name anywhere opens that person's profile.
	openProfile: function(actor) {
		if (!actor) { return; }
		this.section = "profile";
		var items = this.$.nav.getControls();
		for (var i = 0; i < items.length; i++) {
			items[i].addRemoveClass("bs-rail-on", items[i].section === "profile");
		}
		this.$.content.selectViewByName("profile");
		this.$.profile.open(actor);
	},

	// ---- the feed ----

	refresh: function() {
		var self = this;
		var turn = ++this.turn;
		this.cursor = "";
		this.more = true;
		this.loading = true;
		this.$.feed.showNote("Loading…");
		BS.Api.timeline("", function(error, data) {
			if (turn !== self.turn) { return; }
			self.loading = false;
			if (error) { self.onError(error, true); return; }
			self.cursor = data.cursor || "";
			self.more = !!data.cursor;
			self.$.feed.setItems(data.feed || []);
		});
	},

	needMore: function() {
		var self = this;
		if (this.loading || !this.more || !this.cursor) { return; }
		var turn = this.turn;
		this.loading = true;
		BS.Api.timeline(this.cursor, function(error, data) {
			if (turn !== self.turn) { return; }
			self.loading = false;
			if (error) {
				if (error === "signin") { self.onError(error, false); }
				else { BS.banner(error); }
				return;
			}
			self.cursor = data.cursor || "";
			self.more = !!data.cursor;
			self.$.feed.append(data.feed || []);
		});
	},

	onError: function(error, firstLoad) {
		if (error === "signin") {
			BS.Api.logout();
			this.$.login.reset();
			this.$.pane.selectViewByName("login");
			BS.banner("Please sign in again.");
			return;
		}
		if (firstLoad) { this.$.feed.showNote(error); }
		else { BS.banner(error); }
	},

	refreshClick: function() {
		this.$.feed.toTop();
		this.refresh();
	},

	// ---- composing and replying ----

	composeClick: function() {
		this.$.compose.show();
		this.$.pane.selectViewByName("compose");
	},

	reply: function(inSender, post) {
		this.$.compose.replyTo(post);
		this.$.pane.selectViewByName("compose");
	},

	composeCancel: function() {
		this.$.pane.selectViewByName("main");
	},

	posted: function() {
		var self = this;
		this.$.pane.selectViewByName("main");
		setTimeout(function() {
			self.goTo("home");
			self.refreshClick();
		}, 1200);
	},

	// ---- pictures: long-press to save ----

	saveImage: function(inSender, info) {
		info = info || {};
		if (!info.url) { return; }
		BS.banner("Saving…");
		this.$.saveSvc.call({url: info.url, name: info.name || "bluesky.jpg"});
	},

	saved: function(inSender, inResponse) {
		var r = inResponse || {};
		if (r.ok) {
			BS.banner(r.already ? "Already saved" : "Saved to " + String(r.file).replace("/media/internal/", ""));
		} else {
			BS.banner(r.error || "The picture could not be saved.");
		}
	},

	// ---- video: relay the HLS stream, play it fullscreen ----

	playVideo: function(url) {
		BS.log("playVideo " + url);
		BS.banner("Loading video…");
		this.$.videoSvc.call({url: url});
	},

	videoReady: function(inSender, resp) {
		BS.log("videoReady " + enyo.json.stringify(resp || {}));
		if (!resp || !resp.returnValue || !resp.url) {
			BS.banner("Could not load that video.");
			return;
		}
		this.$.videoBox.setContent(
			"<video id='bsvideo' class='bs-video-el' autoplay controls>" +
			"<source src='" + resp.url + "' type='application/vnd.apple.mpegurl'></video>");
		this.$.videoLayer.setShowing(true);
		if (this.$.videoBox.hasNode()) { this.$.videoBox.render(); }
		var self = this;
		this.videoPing = setInterval(function() { self.$.pingSvc.call({}); }, 30000);
	},

	closeVideo: function() {
		if (this.videoPing) { clearInterval(this.videoPing); this.videoPing = null; }
		try {
			var v = document.getElementById("bsvideo");
			if (v) { v.pause(); v.src = ""; }
		} catch (e) {}
		this.$.videoBox.setContent("");
		this.$.videoLayer.setShowing(false);
	},

	// A link card was tapped: YouTube opens in MeTube, everything else in the
	// browser (Atlas if it is installed, otherwise whatever handles the URL).
	openLink: function(url) {
		if (!url) { return; }
		if (BS.youtubeUrl(url)) {
			this.$.appMgr.call({id: "com.jonandnic.metube", params: {target: url}});
			BS.banner("Opening in MeTube…");
			return;
		}
		this.pendingLink = url;
		this.$.atlasSvc.call({id: "org.webosports.app.atlas", params: {url: url}});
	},

	// If Atlas is not installed, hand the URL to the default handler.
	atlasResult: function(inSender, resp) {
		if ((!resp || !resp.returnValue) && this.pendingLink) {
			this.$.opener.call({target: this.pendingLink});
		}
	},

	// A name was tapped anywhere: open that profile.
	pick: function(inSender, actor) {
		this.openProfile(actor);
	},

	// A post was tapped: open its thread, remembering where to return.
	openThread: function(inSender, uri) {
		if (!uri) { return; }
		var cur = this.$.content.getViewName();
		if (cur !== "thread") { this.threadReturn = cur; }
		this.$.content.selectViewByName("thread");
		this.$.thread.open(uri);
	},

	threadBack: function() {
		this.$.content.selectViewByName(this.threadReturn || "feed");
	},

	// ---- account ----

	signOut: function() {
		BS.Api.logout();
		this.turn++;
		this.$.feed.setItems([]);
		this.$.login.reset();
		this.$.pane.selectViewByName("login");
	},

	backGesture: function(inSender, inEvent) {
		if (this.$.videoLayer.getShowing()) {
			this.closeVideo();
			inEvent.preventDefault();
			return true;
		}
		if (this.$.pane.getViewName() === "compose") {
			this.$.pane.selectViewByName("main");
			inEvent.preventDefault();
			return true;
		}
		// In a thread, step back through it (and finally to where it opened from).
		if (this.$.pane.getViewName() === "main" && this.$.content.getViewName() === "thread") {
			this.$.thread.backClick();
			inEvent.preventDefault();
			return true;
		}
		// Within Feeds/Lists/Chat, back out of the inner view first.
		if (this.$.pane.getViewName() === "main") {
			if (this.section === "feeds" && this.$.feeds.atPosts()) {
				this.$.feeds.backToList(); inEvent.preventDefault(); return true;
			}
			if (this.section === "lists" && this.$.lists.atPosts()) {
				this.$.lists.backToList(); inEvent.preventDefault(); return true;
			}
			if (this.section === "chat" && this.$.chat.atMsg()) {
				this.$.chat.backToList(); inEvent.preventDefault(); return true;
			}
		}
		// Anywhere but Home goes back to Home before leaving the app.
		if (this.$.pane.getViewName() === "main" && this.section !== "home") {
			this.goTo("home");
			inEvent.preventDefault();
			return true;
		}
		return;
	}
});
