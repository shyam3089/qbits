export const HTML_NAMESPACE='http://www.w3.org/1999/xhtml';
export const SVG_NAMESPACE='http://www.w3.org/2000/svg';
export const XLINK_NAMESPACE='http://www.w3.org/1999/xlink';

export const htmlElements=new Set('a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr'.split(' '));
export const svgElements=new Set('a animate animateMotion animateTransform circle clipPath defs desc discard ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient marker mask metadata mpath path pattern polygon polyline radialGradient rect script set stop style svg switch symbol text textPath title tspan use view'.split(' '));
export const voidElements=new Set('area base br col embed hr img input link meta source track wbr'.split(' '));
export const booleanAttributes=new Set('allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected'.split(' '));
export const urlAttributes=new Set(['action','cite','data','formaction','href','imagesrcset','poster','src','srcset','xlink:href']);
export const domEvents=new Set('abort animationcancel animationend animationiteration animationstart auxclick beforeinput blur cancel canplay canplaythrough change click close contextmenu copy cuechange cut dblclick drag dragend dragenter dragleave dragover dragstart drop durationchange emptied ended error focus focusin focusout formdata gotpointercapture input invalid keydown keypress keyup load loadeddata loadedmetadata loadstart lostpointercapture mousedown mouseenter mouseleave mousemove mouseout mouseover mouseup paste pause play playing pointercancel pointerdown pointerenter pointerleave pointermove pointerout pointerover pointerup progress ratechange reset resize scroll securitypolicyviolation seeked seeking select slotchange stalled submit suspend timeupdate toggle touchcancel touchend touchmove touchstart transitioncancel transitionend transitionrun transitionstart volumechange waiting wheel'.split(' '));

export function isCustomElement(tag:string):boolean{return /^[a-z][a-z0-9._]*-[a-z0-9._-]+$/.test(tag);}
export function isSafeUrl(value:string):boolean {
  const compact=value.trim().replace(/[\u0000-\u0020\u007f]+/g,'');
  return !/(?:javascript|vbscript|data):/i.test(compact);
}
