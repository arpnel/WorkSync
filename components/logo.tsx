import { cn } from '../lib/utils'
import Image from 'next/image'

export const Logo = ({ className }: { className?: string }) => {
    return (
        <Image
            src="/WorkSyncLogo.png"
            alt="Logo"
            width={120}
            height={40}
            className={cn('h-6 w-auto', className)}
            priority
        />
    )
}

export const LogoIcon = ({ className }: { className?: string }) => {
    return (
        <Image
            src="/WorkSyncLogo.png"
            alt="Logo"
            width={40}
            height={40}
            className={cn('size-6', className)}
            priority
        />
    )
}
