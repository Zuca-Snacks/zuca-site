/**
 * Flavors — the two real products, using the two real photographs in the repo.
 *
 * Both images are lazy-loaded (below the fold) and served AVIF -> WebP -> JPEG
 * with explicit dimensions so they reserve their own space and contribute no CLS.
 */
import Card from '../ui/Card.jsx';
import Badge from '../ui/Badge.jsx';
import { sections } from '../../content/copy.js';

const FLAVORS = [
  {
    slug: 'flavor-chocolate-raspberry',
    name: 'Chocolate Raspberry Sea Salt',
    alt: 'Zuca chocolate raspberry sea salt bites, coated in freeze-dried raspberry powder.',
    body:
      'Tart raspberry against dark cocoa, finished with enough sea salt to keep it from being a dessert you get bored of.',
  },
  {
    slug: 'flavor-maple-pecan',
    name: 'Maple Pecan',
    alt: 'Zuca maple pecan bites, rolled in toasted pecan and maple.',
    body:
      'Toasted pecan and real maple. Warm, nutty, and gently sweet rather than sugary.',
  },
];

const PILLS = ['10g fiber', '4g protein', '150 cal', 'No added sugar'];

export default function Flavors() {
  return (
    <section className="z-section z-container z-reveal z-has-art" id="flavors" aria-labelledby="flavors-title">
      <div className="z-art z-art--berries" aria-hidden="true" />
      <span className="z-section__eyebrow">Flavors</span>
      <h2 id="flavors-title">{sections.product.title}</h2>
      <p className="z-section__lede">{sections.product.body}</p>

      <ul className="z-flavors__grid">
        {FLAVORS.map((f) => (
          <Card as="li" flush key={f.slug}>
            <div className="z-flavor__media">
              <picture>
                <source
                  type="image/avif"
                  srcSet={`/images/${f.slug}-360.avif 360w, /images/${f.slug}-640.avif 640w`}
                  sizes="(min-width: 40em) 50vw, 100vw"
                />
                <source
                  type="image/webp"
                  srcSet={`/images/${f.slug}-360.webp 360w, /images/${f.slug}-640.webp 640w`}
                  sizes="(min-width: 40em) 50vw, 100vw"
                />
                <img
                  src={`/images/${f.slug}-640.jpg`}
                  width="640"
                  height="640"
                  alt={f.alt}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
            </div>

            <div className="z-flavor__body">
              <h3 className="z-flavor__name">{f.name}</h3>
              <p>{f.body}</p>
              <ul className="z-flavor__pills">
                {PILLS.map((p) => (
                  <li key={p}>
                    <Badge>{p}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </ul>
    </section>
  );
}
