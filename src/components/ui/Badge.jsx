/**
 * Badge — a small pill for facts and labels ("10g fiber", "Pre-order open").
 *
 * Props
 *   variant   'default' | 'brand' | 'warm'
 *             'warm' is the amber fill with dark ink. Amber is only ever a
 *             FILL: amber text on cream is 1.45:1 and cannot carry meaning.
 *   as        element type   default 'span'
 *   children  node
 *   ...rest   forwarded
 */
export default function Badge({
  variant = 'default',
  as = 'span',
  children,
  className = '',
  ...rest
}) {
  const Tag = as;
  const classes = [
    'z-badge',
    variant !== 'default' && `z-badge--${variant}`,
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
