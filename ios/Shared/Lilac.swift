import SwiftUI

// The colours of the new style, after the reference the user picked on 2026-10-09, for the app and its widgets alike.

enum Lilac {
    static let canvas = Color(light: 0xF7F6F3, dark: 0x0E0E11)
    static let surface = Color(light: 0xFFFFFF, dark: 0x1C1B21)
    static let muted = Color(light: 0x8B8A93, dark: 0x908F99)
    static let hairline = Color(light: 0xE8E6EB, dark: 0x2A2930)
    /// The track of a switch or a bar.
    static let track = Color(light: 0xEDECEF, dark: 0x22212A)
    /// What is picked or today, and what is required.
    static let accent = Color(light: 0x6B4EF6, dark: 0x8F7CFF)
    /// The ground of a picked tab, a halo or a chip.
    static let tint = Color(light: 0xEEEAFE, dark: 0x2B2650)
    /// What is flexible: the lighter part of a bar.
    static let soft = Color(light: 0xC9BEFA, dark: 0x5546A6)
    /// The top of the lens on the circle, which deepens into the tint below.
    static let lensTop = Color(light: 0xF5F2FE, dark: 0x3A3170)
    static let red = Palette.color("red")
    /// The wave on the circle: violet while the week has enough, pale when little is left, red past its amount.
    static let wave = Color(light: 0x8B62F6, dark: 0x7A62F0)
    static let waveLow = Color(light: 0xD7C5FB, dark: 0x4B3E95)
    static let waveOver = Color(light: 0xFF5D5A, dark: 0xE5484D)
}

enum LilacSymbol {
    /// The extras' wallet, as the user's picture draws it; iOS 17 has only the pass.
    static var wallet: String {
        if #available(iOS 18, macOS 15, *) { "wallet.bifold" } else { "wallet.pass" }
    }
}
