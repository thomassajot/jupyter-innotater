var widgets = require('@jupyter-widgets/base');
var controls = require('@jupyter-widgets/controls');

require("./style.css");

var _ = require('lodash');

var $ = require('jquery');


// Custom Model. Custom widgets models must at least provide default values
// for model attributes, including
//
//  - `_view_name`
//  - `_view_module`
//  - `_view_module_version`
//
//  - `_model_name`
//  - `_model_module`
//  - `_model_module_version`
//
//  when different from the base class.

// When serialiazing the entire widget state for embedding, only values that
// differ from the defaults will be specified.


var InnotaterImagePadModel = controls.ImageModel.extend({
	defaults: _.extend(controls.ImageModel.prototype.defaults(), {
		/*_model_name: 'InnotaterImagePadModel',
		_view_name: 'InnotaterImagePadView',
		_model_module: 'jupyter-innotater',
		_view_module: 'jupyter-innotater',
		_model_module_version: '0.1.0',
		_view_module_version: '0.1.0', */
		/*rect: [0,0,0,0],
		is_bb_source: false */
	})
});


// Custom View. Renders the widget model.
var InnotaterImagePadView = widgets.DOMWidgetView.extend({

	InnotaterImagePadView: function() {
		this.imageLoaded = false;
		InnotaterImagePadView.__super__.apply(this, arguments);
	},

	render: function () {
		/**
		 * Called when view is rendered.
		 */
		var self = this;

		InnotaterImagePadView.__super__.render.apply(this, arguments);
		this.pWidget.addClass('jupyter-widgets');
		this.pWidget.addClass('widget-image');

		this.imgel = new Image();

		this.canvas = $('<canvas></canvas>', {'class': 'jupyter-innotater-imagepad'})[0];

		this.$el.append($('<div></div>').append(this.canvas));

		self.rectX = 0;
		self.rectY = 0;
		self.rectW = 0;
		self.rectH = 0;
		self.isSelecting = false;

		var $canvas = $(self.canvas);
		$(this.canvas).on('mousedown', function(e) {
			if (self.is_bb_source && e.which == 1) {
				self.p = $canvas.offset();
				self.rectX = (e.pageX - self.p.left) / self.zoom;
				self.rectY = (e.pageY - self.p.top) / self.zoom;
				self.isSelecting = true;
				self.rectW = 0;
				self.rectH = 0;
			}
		}).on('mousemove', function(e) {
			if (self.isSelecting) {
				self.rectW = (e.pageX - self.p.left) / self.zoom  - self.rectX;
				self.rectH = (e.pageY - self.p.top) / self.zoom - self.rectY;
				self.drawCanvas();
			}
		}).on('mouseup mouseleave', function(e) {
			if (self.isSelecting) {
				self.rectW = Math.round((e.pageX - self.p.left) / self.zoom  - self.rectX);
				self.rectH = Math.round((e.pageY - self.p.top) / self.zoom - self.rectY);

				self.rectX = Math.round(self.rectX); // Wait until rectW/H calculated to avoid rounding the difference twice
				self.rectY = Math.round(self.rectY);

				// Check bounds and adjust
				if (self.rectW < 0) {
					self.rectX += self.rectW;
					self.rectW = -self.rectW;
				}
				if (self.rectH < 0) {
					self.rectY += self.rectH;
					self.rectH = -self.rectH;
				}

				if (self.rectX < 0) { self.rectX = 0; }
				if (self.rectY < 0) { self.rectY = 0; }
				if (self.rectX + self.rectW > self.imgel.width) { self.rectW = self.imgel.width - self.rectX; }
				if (self.rectY + self.rectH > self.imgel.height) { self.rectH = self.imgel.height - self.rectY; }

				// Sync to backend
				self.model.set({'rect': [self.rectX, self.rectY, self.rectW, self.rectH]});
				self.model.save_changes();
				self.isSelecting = false;

				//self.update will be called automatically because model was changed
			}
		});

		this.update();
	},

	update: function () {
		/**
		 * Update the contents of this view
		 *
		 * Called when the model is changed.  The model may have been
		 * changed by another view or by a state update from the back-end.
		 */
		this.imageLoaded = false;

		var new_is_bb_source = this.model.get('is_bb_source');

		if (new_is_bb_source != this.is_bb_source) {
			if (new_is_bb_source) {
				$(this.canvas).addClass('is_bb_source');
			}
			else {
				$(this.canvas).removeClass('is_bb_source');
			}
			this.is_bb_source = new_is_bb_source;
		}

		var url;
		var format = this.model.get('format');
		var value = this.model.get('value');
		if (format !== 'url') {
			var blob = new Blob([value], { type: "image/" + this.model.get('format') });
			url = URL.createObjectURL(blob);
		}
		else {
			url = (new TextDecoder('utf-8')).decode(value.buffer);
		}
		// Clean up the old objectURL
		var oldurl = this.imgel.src;
		this.imgel.src = url;
		if (oldurl && typeof oldurl !== 'string') {
			URL.revokeObjectURL(oldurl);
		}


		// Get bounding box from model

		var r = this.model.get('rect');
		this.rectX = r[0];
		this.rectY = r[1];
		this.rectW = r[2];
		this.rectH = r[3];

		this.usewidth = 0;
		this.useheight = 0;
		this.zoom = 1.0;

		var self = this;
		this.imgel.onload = function() {


			var wantwidth = self.model.get('wantwidth');
			var wantheight = self.model.get('wantheight');

			self.usewidth = 0;
			self.useheight = 0;

			if (wantwidth !== undefined && wantwidth > 0) {
				self.usewidth = wantwidth;
				self.canvas.setAttribute('width', wantwidth.toString());

				if (wantwidth > self.imgel.width) {
					self.usewidth = self.imgel.width;
					self.zoom = 1.0;
				}
				else {
					self.usewidth = wantwidth;
					self.zoom = wantwidth / self.imgel.width;
				}
			}
			else {
				self.usewidth = self.imgel.width;
				self.zoom = 1.0;
				self.canvas.setAttribute('width', self.imgel.width.toString());
			}

			self.useheight = self.imgel.height * self.zoom;
			if (wantheight !== undefined && wantheight > 0) {
				// Take wantheight as a max height, zoom further if needed
				self.canvas.setAttribute('height', wantheight.toString());

				if (self.useheight > wantheight) {
					self.useheight = wantheight;
					self.zoom = wantheight / self.imgel.height;
					self.usewidth = self.imgel.width * self.zoom;
					if (wantwidth == undefined || wantwidth <= 0) {
						// wantwidth wasn't specified, so cut width further
						self.canvas.setAttribute('width', self.usewidth.toString());
					}
				}
			}
			else {
				self.canvas.setAttribute('height', self.useheight.toString());
			}

			self.imageLoaded = true;

			self.drawCanvas();
		}

		return InnotaterImagePadView.__super__.update.apply(this, arguments);
	},

	drawCanvas: function() {
		var self = this;
		var ctx = this.canvas.getContext('2d');

		ctx.fillStyle = 'lightGrey';
		ctx.fillRect(0,0,self.canvas.width,self.canvas.height);

		ctx.drawImage(this.imgel, 0, 0, self.usewidth, self.useheight);

		if (self.is_bb_source) {
			ctx.save();
			ctx.globalAlpha = 0.9;

			ctx.beginPath();
			ctx.strokeStyle = "#FFFFFF";
			ctx.rect(this.rectX*this.zoom, this.rectY*this.zoom, this.rectW*this.zoom, this.rectH*this.zoom);
			ctx.stroke();

			ctx.beginPath();
			ctx.strokeStyle = "#000000";
			ctx.setLineDash([5]);
			ctx.rect(this.rectX*this.zoom, this.rectY*this.zoom, this.rectW*this.zoom, this.rectH*this.zoom);
			ctx.stroke();

			ctx.restore();
		}
	},

	remove: function() {
		if (this.imgel.src) {
			URL.revokeObjectURL(this.imgel.src);
		}
		InnotaterImagePadView.__super__.remove.apply(this, arguments);
	}
});

Object.defineProperty(InnotaterImagePadView.prototype, "tagName", {
	/**
	 * The default tag name.
	 *
	 * #### Notes
	 * This is a read-only attribute.
	 */
	get: function () {
		// We can't make this an attribute with a default value
		// since it would be set after it is needed in the
		// constructor.
		return 'div';
	},
	enumerable: true,
	configurable: true
});

module.exports = {
    InnotaterImagePadModel: InnotaterImagePadModel,
    InnotaterImagePadView: InnotaterImagePadView
};



