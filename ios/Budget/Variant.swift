import SwiftUI

// Prototype: the looks being compared, switched by a floating pill. A is the app as it is, which reads as a wireframe:
// pale tiles, grey on white, a yellow dot on every card, the free part of the bar a grey bar like a loading skeleton,
// and nothing moves. B gives the cards solid colour, the bar one piece, money a rounded face and ₽, and the screen
// motion and touch; C does the same but marks an expense with the first letter of whom it went to, as banks do.

enum Variant: String, CaseIterable {
    case a = "A", b = "B", c = "C"

    /// B and C.
    var alive: Bool { self != .a }
    /// C: an expense shows the first letter of its title on a circle rather than its category's icon.
    var letters: Bool { self == .c }

    /// The variant to start with, from a launch argument: -variant C.
    static var launch: Variant { UserDefaults.standard.string(forKey: "variant").flatMap(Variant.init(rawValue:)) ?? .a }

    /// The symbol as B and C write it: ₽ for руб.
    func symbol(_ symbol: String) -> String { alive && symbol == "руб." ? "₽" : symbol }
}

extension EnvironmentValues {
    @Entry var variant = Variant.a
}

/// The floating switch between the variants.
struct VariantSwitch: View {
    @Binding var variant: Variant

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Variant.allCases, id: \.self) { item in
                Button { withAnimation(.snappy) { variant = item } } label: {
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

/// A card as a button: in B and C it gives under the finger and springs back.
struct CardButtonStyle: ButtonStyle {
    @Environment(\.variant) private var variant

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(variant.alive && configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == CardButtonStyle {
    static var card: CardButtonStyle { CardButtonStyle() }
}

/// Whether a row is an expense or an operation, whose title is whom the money went to: variant C marks it with a letter.
func paysSomeone(_ row: Row) -> Bool {
    row.id.hasPrefix("spending-") || UUID(uuidString: row.id) != nil
}
