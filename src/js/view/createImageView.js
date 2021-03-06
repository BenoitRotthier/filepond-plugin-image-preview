import { cloneCanvas } from '../utils/cloneCanvas';

const IMAGE_SCALE_SPRING_PROPS = {
    type: 'spring',
    stiffness: 0.5,
    damping: 0.45,
    mass: 10
};

const createVector = (x,y) => ({x,y});

const vectorDot = (a, b) => a.x * b.x + a.y * b.y;

const vectorSubtract = (a, b) => createVector(a.x - b.x, a.y - b.y);

const vectorDistanceSquared = (a, b) => vectorDot(vectorSubtract(a, b), vectorSubtract(a, b));

const vectorDistance = (a, b) => Math.sqrt(vectorDistanceSquared(a, b));

const getOffsetPointOnEdge = (length, rotation) => {

    const a = length;

    const A = 1.5707963267948966;
    const B = rotation;
    const C = 1.5707963267948966 - rotation;

    const sinA = Math.sin(A);
    const sinB = Math.sin(B);
    const sinC = Math.sin(C);
    const cosC = Math.cos(C);
    const ratio = a / sinA;
    const b = ratio * sinB;
    const c = ratio * sinC;

    return createVector(cosC * b, cosC * c);

}

const getRotatedRectSize = (rect, rotation) => {

    const w = rect.width;
    const h = rect.height;

    const hor = getOffsetPointOnEdge(w, rotation);
    const ver = getOffsetPointOnEdge(h, rotation);

    const tl = createVector(
        rect.x + Math.abs(hor.x),
        rect.y - Math.abs(hor.y)
    )

    const tr = createVector(
        rect.x + rect.width + Math.abs(ver.y),
        rect.y + Math.abs(ver.x)
    )

    const bl = createVector(
        rect.x - Math.abs(ver.y),
        (rect.y + rect.height) - Math.abs(ver.x)
    )
    
    return {
        width: vectorDistance(tl, tr),
        height: vectorDistance(tl, bl)
    }

};

const getImageRectZoomFactor = (imageRect, cropRect, rotation, center) => {

    // calculate available space round image center position
    const cx = center.x > .5 ? 1 - center.x : center.x;
    const cy = center.y > .5 ? 1 - center.y : center.y;
    const imageWidth = cx * 2 * imageRect.width;
    const imageHeight = cy * 2 * imageRect.height;

    // calculate rotated crop rectangle size
    const rotatedCropSize = getRotatedRectSize(cropRect, rotation);

    // calculate scalar required to fit image
    return Math.max(
        rotatedCropSize.width / imageWidth, 
        rotatedCropSize.height / imageHeight
    );

};

const getCenteredCropRect = (container, aspectRatio) => {

    let width = container.width;
    let height = width * aspectRatio;
    if (height > container.height) {
        height = container.height;
        width = height / aspectRatio;
    }
    const x = ((container.width - width) * .5);
    const y = ((container.height - height) * .5);

    return {
        x, y, width, height
    }

}


// does horizontal and vertical flipping
const createBitmapView = _ => _.utils.createView({
    name: 'image-bitmap',
    ignoreRect: true,
    mixins: { styles: ['scaleX', 'scaleY'] },
    create:({ root, props }) => {
        root.appendChild(props.image);
    }
});


// shifts and rotates image
const createImageCanvasWrapper = _ => _.utils.createView({
    name: 'image-canvas-wrapper',
    tag: 'div',
    ignoreRect: true,
    mixins: {
        apis: [
            'crop',
            'width', 
            'height'
        ],
        styles: [
            'originX',
            'originY',
            'translateX',
            'translateY',
            'scaleX',
            'scaleY',
            'rotateZ'
        ],
        animations: {
            originX: IMAGE_SCALE_SPRING_PROPS,
            originY: IMAGE_SCALE_SPRING_PROPS,
            scaleX: IMAGE_SCALE_SPRING_PROPS,
            scaleY: IMAGE_SCALE_SPRING_PROPS,
            translateX: IMAGE_SCALE_SPRING_PROPS,
            translateY: IMAGE_SCALE_SPRING_PROPS,
            rotateZ: IMAGE_SCALE_SPRING_PROPS
        }
    },
    create:({ root, props }) => {
        props.width = props.image.width;
        props.height = props.image.height;
        root.ref.bitmap = root.appendChildView(
            root.createChildView(
                createBitmapView(_), { image: props.image }
            )
        );
    },
    write:({ root, props }) => {
        const { flip } = props.crop;
        const { bitmap } = root.ref;
        bitmap.scaleX = flip.horizontal ? -1 : 1;
        bitmap.scaleY = flip.vertical ? -1 : 1;
    }
});


// clips canvas to correct aspect ratio
const createClipView = _ => _.utils.createView({
    name: 'image-clip',
    tag: 'div',
    ignoreRect: true,
    mixins: {
        apis: ['crop', 'width', 'height'],
        styles: ['width', 'height', 'opacity'],
        animations: {
            opacity: { type: 'tween', duration: 250 }
        }
    },
    create:({ root, props }) => {

        root.ref.image = root.appendChildView(
            root.createChildView(createImageCanvasWrapper(_), Object.assign({}, props))
        );

        // set up transparency grid
        const transparencyIndicator = root.query('GET_IMAGE_PREVIEW_TRANSPARENCY_INDICATOR');
        if (transparencyIndicator === null) {
            return;
        }

        // grid pattern
        if (transparencyIndicator === 'grid') {
            root.element.dataset.transparencyIndicator = transparencyIndicator;
        }
        // basic color
        else {
            root.element.dataset.transparencyIndicator = 'color';
        }

    },
    write: ({ root, props, shouldOptimize }) => {

        const { crop, width, height } = props;

        root.ref.image.crop = crop;

        const stage = {
            x: 0,
            y: 0,
            width,
            height,
            center: {
                x: width * .5,
                y: height * .5
            }
        };
    
        const image = {
            width: root.ref.image.width,
            height: root.ref.image.height
        };
    
        const origin = {
            x: crop.center.x * image.width,
            y: crop.center.y * image.height
        };
    
        const translation = {
            x: stage.center.x - (image.width * crop.center.x),
            y: stage.center.y - (image.height * crop.center.y)
        };
    
        const rotation = (Math.PI * 2) + (crop.rotation % (Math.PI * 2));
        
        const cropAspectRatio = crop.aspectRatio || image.height / image.width;

        const stageZoomFactor = getImageRectZoomFactor(
            image,
            getCenteredCropRect(
                stage, 
                cropAspectRatio
            ),
            rotation,
            crop.center
        );
    
        const scale = crop.zoom * stageZoomFactor;
    
        const imageView = root.ref.image;

        // don't update clip layout
        if (shouldOptimize) {
            imageView.originX = null;
            imageView.originY = null;
            imageView.translateX = null;
            imageView.translateY = null;
            imageView.rotateZ = null;
            imageView.scaleX = null;
            imageView.scaleY = null;
            return;
        }

        imageView.originX = origin.x;
        imageView.originY = origin.y;
        imageView.translateX = translation.x;
        imageView.translateY = translation.y;
        imageView.rotateZ = rotation;
        imageView.scaleX = scale;
        imageView.scaleY = scale;
    }
});

export const createImageView = _ => _.utils.createView({
    name: 'image-preview',
    tag: 'div',
    ignoreRect: true,
    mixins: {
        apis: [
            'crop',
            'image'
        ],
        styles: [
            'translateY',
            'scaleX', 
            'scaleY',
            'opacity'
        ],
        animations: {
            scaleX: IMAGE_SCALE_SPRING_PROPS,
            scaleY: IMAGE_SCALE_SPRING_PROPS,
            translateY: IMAGE_SCALE_SPRING_PROPS,
            opacity: { type: 'tween', duration: 400 }
        }
    },
    create: ({ root, props }) => {
        root.ref.clip = root.appendChildView(
            root.createChildView(createClipView(_), {
                image: props.image,
                crop: props.crop
            })
        );
    },
    write: ({ root, props, shouldOptimize }) => {

        const { clip } = root.ref;

        const { crop, image } = props;

        clip.crop = crop;

        // don't update clip layout
        clip.opacity = shouldOptimize ? 0 : 1;
        if (shouldOptimize) {
            return;
        }

        // calculate scaled preview image size
        const imageAspectRatio = image.height / image.width;
        let aspectRatio = crop.aspectRatio || imageAspectRatio;

        // calculate container size
        const containerWidth = root.rect.inner.width;
        const containerHeight = root.rect.inner.height;

        let fixedPreviewHeight = root.query('GET_IMAGE_PREVIEW_HEIGHT');
        const minPreviewHeight = root.query('GET_IMAGE_PREVIEW_MIN_HEIGHT');
        const maxPreviewHeight = root.query('GET_IMAGE_PREVIEW_MAX_HEIGHT');

        const panelAspectRatio = root.query('GET_PANEL_ASPECT_RATIO');
        const allowMultiple = root.query('GET_ALLOW_MULTIPLE');

        if (panelAspectRatio && !allowMultiple) {
            fixedPreviewHeight = containerWidth * panelAspectRatio;
            aspectRatio = panelAspectRatio;
        }

        // determine clip width and height
        let clipHeight =
            fixedPreviewHeight !== null
                ? fixedPreviewHeight
                : Math.max(
                    minPreviewHeight,
                    Math.min(
                        containerWidth * aspectRatio,
                        maxPreviewHeight
                    )
                );

        let clipWidth = clipHeight / aspectRatio;
        if (clipWidth > containerWidth) {
            clipWidth = containerWidth;
            clipHeight = clipWidth * aspectRatio;
        }

        if (clipHeight > containerHeight) {
            clipHeight = containerHeight;
            clipWidth = containerHeight / aspectRatio;
        }

        clip.width = clipWidth;
        clip.height = clipHeight;
    }

});