const logoSrc = `${import.meta.env.BASE_URL}seven-knights-logo.png`

type Props = {
  className?: string
}

export function BrandLogo({ className = 'guide-brand-logo' }: Props) {
  return (
    <img src={logoSrc} alt="Seven Knights" className={className} />
  )
}
