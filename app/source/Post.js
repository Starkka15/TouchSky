/* One post in a feed: who, what they said, any pictures, and the row of
	reply / repost / like. Likes and reposts are toggled right here and the
	count updated in place. */
enyo.kind({
	name: "BS.Post",
	kind: enyo.Control,
	className: "bs-post",
	events: {
		onReply: "",      // (this, post)         reply to this post
		onSave: "",       // (this, {url, name})  save a picture (long-press)
		onPick: "",       // (this, handleOrDid)  open the author's profile
		onOpen: ""        // (this, uri)          open the post's thread
	},
	components: [
		{name: "reason", className: "bs-post-reason", showing: false, allowHtml: true},
		{kind: "HFlexBox", components: [
			{name: "avatar", className: "bs-post-avatar", onclick: "authorClick"},
			{kind: "VFlexBox", flex: 1, components: [
				{name: "head", className: "bs-post-head", allowHtml: true, onclick: "authorClick"},
				{name: "text", className: "bs-post-text", allowHtml: true, onclick: "textClick"},
				{name: "media", className: "bs-post-media"},
				{kind: "HFlexBox", className: "bs-post-actions", components: [
					{name: "reply", className: "bs-act", allowHtml: true, onclick: "replyClick"},
					{name: "repost", className: "bs-act", allowHtml: true, onclick: "repostClick"},
					{name: "like", className: "bs-act", allowHtml: true, onclick: "likeClick"},
					{name: "bookmark", className: "bs-act", onclick: "bookmarkClick"},
					{name: "link", className: "bs-act", content: "Link", onclick: "linkClick"}
				]}
			]}
		]}
	],

	rendered: function() {
		this.inherited(arguments);
		if (this.pendingEmoji && this.pendingEmoji.length) {
			BS.fillEmoji(this.pendingEmoji);
			this.pendingEmoji = null;
		}
	},

	// Text to HTML with emoji images, queued to fill once this post has a node.
	emoji: function(text) {
		var r = BS.emojiHtml(text);
		if (r.list.length) {
			this.pendingEmoji = (this.pendingEmoji || []).concat(r.list);
		}
		return r.html;
	},

	// Fill in from a feed item ({post, reason, reply}).
	setItem: function(item) {
		this.pendingEmoji = [];
		this.item = item || {};
		var post = this.item.post || {};
		this.post = post;
		var author = post.author || {};
		var record = post.record || {};

		// "Reposted by …"
		var reason = this.item.reason;
		if (reason && reason.$type === "app.bsky.feed.defs#reasonRepost" && reason.by) {
			this.$.reason.setContent("Reposted by " +
				BS.escape(reason.by.displayName || ("@" + reason.by.handle)));
			this.$.reason.setShowing(true);
		} else {
			this.$.reason.setShowing(false);
		}

		this.loadBg(this.$.avatar, BS.avatarThumb(author.avatar));

		var name = this.emoji(author.displayName || author.handle || "");
		this.$.head.setContent(
			"<span class='bs-name'>" + name + "</span>" +
			"<span class='bs-handle'>@" + BS.escape(author.handle || "") + "</span>" +
			"<span class='bs-time'>· " + BS.timeAgo(record.createdAt || post.indexedAt) + "</span>");

		var text = String(record.text || "");
		this.$.text.setContent(this.emoji(text));
		this.$.text.setShowing(!!text);

		this.renderEmbed(post.embed);
		this.showActions();
	},

	showActions: function() {
		var post = this.post || {};
		var viewer = post.viewer || {};
		this.likeUri = viewer.like || "";
		this.repostUri = viewer.repost || "";
		this.$.reply.setContent("Reply " + BS.count(post.replyCount));
		this.$.repost.setContent("Repost " + BS.count(post.repostCount));
		this.$.repost.addRemoveClass("bs-on", !!this.repostUri);
		this.$.like.setContent((this.likeUri ? "♥" : "♡") + " " + BS.count(post.likeCount));
		this.$.like.addRemoveClass("bs-on", !!this.likeUri);
		var saved = BS.isSaved(post.uri);
		this.$.bookmark.setContent(saved ? "Saved" : "Save");
		this.$.bookmark.addRemoveClass("bs-on", saved);
	},

	bookmarkClick: function() {
		var saved = BS.toggleSave(this.post);
		this.$.bookmark.setContent(saved ? "Saved" : "Save");
		this.$.bookmark.addRemoveClass("bs-on", saved);
		BS.banner(saved ? "Saved" : "Removed from saved");
	},

	linkClick: function() {
		var a = this.post.author || {};
		var url = "https://bsky.app/profile/" + (a.handle || a.did || "") + "/post/" + BS.rkeyOf(this.post.uri);
		BS.banner(BS.copyText(url) ? "Link copied" : url);
	},

	// Paint a picture as a CSS background. The bytes come over XHR and arrive as
	// a data: URI, because this WebKit can neither reach the CDN nor decode WebP.
	loadBg: function(ctrl, url) {
		if (!url) { ctrl.applyStyle("background-image", "none"); return; }
		BS.imgLoad(url, function(data) {
			if (data && ctrl.hasNode !== undefined) {
				ctrl.applyStyle("background-image", "url(" + data + ")");
			}
		});
	},

	// ---- embeds: pictures, link cards, quoted posts ----

	renderEmbed: function(embed) {
		var m = this.$.media;
		m.destroyControls();
		this.addEmbed(m, embed);
		if (m.hasNode()) { m.render(); }
	},

	addEmbed: function(m, embed) {
		if (!embed || !embed.$type) { return; }
		var t = embed.$type;
		if (t === "app.bsky.embed.images#view") {
			this.addImages(m, embed.images || []);
		} else if (t === "app.bsky.embed.video#view") {
			this.addVideo(m, embed);
		} else if (t === "app.bsky.embed.external#view" && embed.external) {
			this.addExternal(m, embed.external);
		} else if (t === "app.bsky.embed.record#view" && embed.record) {
			this.addQuote(m, embed.record);
		} else if (t === "app.bsky.embed.recordWithMedia#view") {
			this.addEmbed(m, embed.media);
			if (embed.record && embed.record.record) {
				this.addQuote(m, embed.record.record);
			}
		}
	},

	// Video can't play here, but show its still with a marker.
	addVideo: function(m, v) {
		var W = 440, h = Math.round(W * 0.6);
		var ar = v.aspectRatio;
		if (ar && ar.width && ar.height) {
			h = Math.max(Math.round(W * 0.3), Math.min(Math.round(W * 1.2), Math.round(W * ar.height / ar.width)));
		}
		var ctrl = m.createComponent({
			className: "bs-img bs-video", onclick: "videoTap", owner: this,
			playlist: v.playlist || "",
			components: [{content: "▶ Video", className: "bs-video-badge"}]
		});
		ctrl.applyStyle("height", h + "px");
		this.loadBg(ctrl, v.thumbnail);
	},

	// Tapping a video plays it (through the relay), handled by the app.
	videoTap: function(inSender) {
		if (inSender.playlist && BS.videoHandler) { BS.videoHandler(inSender.playlist); }
	},

	addImages: function(m, images) {
		var W = 440;    // display width, matching .bs-img max-width
		var post = this.post || {};
		var handle = (post.author && post.author.handle) || "bsky";
		var rkey = BS.rkeyOf(post.uri);
		for (var i = 0; i < images.length; i++) {
			var img = images[i];
			var h = Math.round(W * 0.75);
			var ar = img.aspectRatio;
			if (ar && ar.width && ar.height) {
				h = Math.max(Math.round(W * 0.3), Math.min(Math.round(W * 1.2),
					Math.round(W * ar.height / ar.width)));
			}
			var ctrl = m.createComponent({
				className: "bs-img",
				full: img.fullsize || img.thumb || "",
				savename: handle + "_" + rkey + (images.length > 1 ? "_" + (i + 1) : "") + ".jpg",
				onclick: "imageTap", owner: this
			});
			ctrl.applyStyle("height", h + "px");
			this.loadBg(ctrl, img.thumb || img.fullsize);
		}
	},

	addExternal: function(m, ext) {
		var yt = BS.youtubeUrl(ext.uri);
		var card = m.createComponent({
			className: "bs-card" + (yt ? " bs-card-yt" : ""), linkurl: ext.uri, owner: this,
			onclick: "externalTap",
			components: [
				ext.thumb ? {className: "bs-card-thumb"} : {},
				{content: BS.escape(ext.title || ext.uri), className: "bs-card-title", allowHtml: true},
				{content: BS.escape(ext.description || ""), className: "bs-card-desc", allowHtml: true,
					showing: !!ext.description},
				{content: yt ? "▶ Watch in MeTube" : "↗ Open in browser",
					className: yt ? "bs-card-metube" : "bs-card-open"}
			]
		});
		if (ext.thumb) {
			// First child is the thumb div (named children here register on the view).
			this.loadBg(card.getControls()[0], ext.thumb);
		}
	},

	// A link card: YouTube goes to MeTube, everything else to the browser.
	externalTap: function(inSender) {
		if (inSender.linkurl && BS.linkHandler) { BS.linkHandler(inSender.linkurl); }
	},

	addQuote: function(m, rec) {
		// A quoted post comes through as a record view; be lenient about shape.
		var author = rec.author || {};
		var value = rec.value || rec.record || {};
		var embeds = rec.embeds || [];
		if (!author.handle && !value.text && !embeds.length) { return; }
		var quote = m.createComponent({className: "bs-quote", owner: this});
		var nameHtml = this.emoji(author.displayName || author.handle || "");
		var textHtml = value.text ? this.emoji(value.text) : "";
		quote.createComponent({allowHtml: true, owner: this, content:
			"<span class='bs-name'>" + nameHtml + "</span> " +
			"<span class='bs-handle'>@" + BS.escape(author.handle || "") + "</span>" +
			(textHtml ? "<br>" + textHtml : "")});
		// The quoted post's own pictures/video/card.
		for (var i = 0; i < embeds.length; i++) { this.addEmbed(quote, embeds[i]); }
	},

	// ---- taps ----

	// Hold a picture to save it to the tablet. The hold gesture arrives as a
	// pulsing DOM event; fire once it has rested long enough, on the image the
	// finger is on.
	mouseholdpulseHandler: function(inSender, inEvent) {
		if (!inEvent || inEvent.holdTime < 500 || this.heldStart === inEvent.holdStart) {
			return;
		}
		var c = inEvent.dispatchTarget;
		while (c && c !== this) {
			if (c.full) {
				this.heldStart = inEvent.holdStart;
				this.swallowTap = true;
				this.doSave({url: c.full, name: c.savename});
				return;
			}
			c = c.parent;
		}
	},

	authorClick: function() {
		var a = this.post && this.post.author;
		this.doPick((a && (a.did || a.handle)) || "");
	},

	// Tapping the words opens the thread.
	textClick: function() {
		if (this.post && this.post.uri) { this.doOpen(this.post.uri); }
	},

	// Tapping a picture opens the thread; holding it saves (the hold sets
	// swallowTap so the tap that ends the hold does not also open the thread).
	imageTap: function() {
		if (this.swallowTap) { return; }
		if (this.post && this.post.uri) { this.doOpen(this.post.uri); }
	},

	mousereleaseHandler: function() {
		if (this.swallowTap) {
			var self = this;
			setTimeout(function() { self.swallowTap = false; }, 400);
		}
	},

	replyClick: function() {
		this.doReply(this.post);
	},

	likeClick: function() {
		var self = this;
		var post = this.post;
		if (this.likeBusy) { return; }
		this.likeBusy = true;
		if (this.likeUri) {
			var uri = this.likeUri;
			this.likeUri = "";
			post.likeCount = Math.max(0, (Number(post.likeCount) || 0) - 1);
			this.showActions();
			BS.Api.unlike(uri, function(error) {
				self.likeBusy = false;
				if (error) { self.undoLike(uri); BS.banner(error); }
			});
		} else {
			post.likeCount = (Number(post.likeCount) || 0) + 1;
			this.likeUri = "pending";
			this.showActions();
			BS.Api.like({uri: post.uri, cid: post.cid}, function(error, data) {
				self.likeBusy = false;
				if (error) {
					self.likeUri = "";
					post.likeCount = Math.max(0, (Number(post.likeCount) || 0) - 1);
					self.showActions();
					BS.banner(error);
				} else {
					self.likeUri = (data && data.uri) || "";
					if (!self.post.viewer) { self.post.viewer = {}; }
					self.post.viewer.like = self.likeUri;
				}
			});
		}
	},

	undoLike: function(uri) {
		this.likeUri = uri;
		this.post.likeCount = (Number(this.post.likeCount) || 0) + 1;
		this.showActions();
	},

	repostClick: function() {
		var self = this;
		var post = this.post;
		if (this.repostBusy) { return; }
		this.repostBusy = true;
		if (this.repostUri) {
			var uri = this.repostUri;
			this.repostUri = "";
			post.repostCount = Math.max(0, (Number(post.repostCount) || 0) - 1);
			this.showActions();
			BS.Api.unrepost(uri, function(error) {
				self.repostBusy = false;
				if (error) {
					self.repostUri = uri;
					post.repostCount = (Number(post.repostCount) || 0) + 1;
					self.showActions();
					BS.banner(error);
				}
			});
		} else {
			post.repostCount = (Number(post.repostCount) || 0) + 1;
			this.repostUri = "pending";
			this.showActions();
			BS.Api.repost({uri: post.uri, cid: post.cid}, function(error, data) {
				self.repostBusy = false;
				if (error) {
					self.repostUri = "";
					post.repostCount = Math.max(0, (Number(post.repostCount) || 0) - 1);
					self.showActions();
					BS.banner(error);
				} else {
					self.repostUri = (data && data.uri) || "";
					if (!self.post.viewer) { self.post.viewer = {}; }
					self.post.viewer.repost = self.repostUri;
				}
			});
		}
	}
});
