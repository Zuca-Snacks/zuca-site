/**
 * Card
 *
 * Props
 *   variant   'default' | 'alt'    'alt' uses the cream-2 surface
 *   flush     boolean              removes padding + clips children
 *                                  (use when the card is image-led)
 *   as        element type         default 'div' — pass 'li', 'article', …
 *   children  node
 *   ...rest   forwarded to the element
 */
export default function Card({
  variant = 'default',
  flush = false,
  as = 'div',
  children,
  className = '',
  ...rest
}) {
  const Tag = as;
  const classes = [
    'z-card',
    variant === 'alt' && 'z-card--alt',
    flush && 'z-card--flush',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
