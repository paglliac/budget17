import SwiftUI

// Prototype: the main page in the new style, two ways. A keeps to the reference: the page fits the screen, a day or
// today's spending opens the week's spending on its own page. B puts the week's spending on the page under the circle,
// and a day picked in the strip leaves only its spending there.

enum Variant: String, CaseIterable {
    case a = "A", b = "B"

    /// The variant to start with, from a launch argument: -variant B.
    static var launch: Variant { UserDefaults.standard.string(forKey: "variant").flatMap(Variant.init(rawValue:)) ?? .a }
}

extension EnvironmentValues {
    @Entry var variant = Variant.a
    @Entry var setVariant: (Variant) -> Void = { _ in }
}

/// The switch between the variants, in the main page's header.
struct VariantSwitch: View {
    @Environment(\.variant) private var variant
    @Environment(\.setVariant) private var setVariant

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Variant.allCases, id: \.self) { item in
                Button { withAnimation(.snappy) { setVariant(item) } } label: {
                    Text(item.rawValue)
                        .font(.caption.weight(.bold))
                        .frame(width: 28, height: 28)
                        .foregroundStyle(item == variant ? Ink.band : .white)
                        .background(item == variant ? Color.white : .clear, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("variant-\(item.rawValue)")
            }
        }
        .padding(3)
        .background(Ink.band.opacity(0.92), in: Capsule())
        .shadow(color: .black.opacity(0.2), radius: 6, y: 2)
    }
}
