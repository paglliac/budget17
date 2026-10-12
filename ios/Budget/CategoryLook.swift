import ImageIO
import SwiftUI
import UniformTypeIdentifiers

/// A category as a disc: the photo the user put on it on the category's colour, which shows through a photo with a
/// clear ground, or else its icon in its colour on a halo of it.
struct CategoryDisc: View {
    let icon: String
    let color: Color
    var photo: String?
    var size: CGFloat = 30

    var body: some View {
        if let photo {
            RemotePhoto(path: photo)
                .frame(width: size, height: size)
                .background(color)
                .clipShape(Circle())
        } else {
            Image(systemName: Icons.symbol(icon))
                .font(.system(size: size * 0.4, weight: .bold))
                .foregroundStyle(color)
                .frame(width: size, height: size)
                .background(color.opacity(0.16), in: Circle())
        }
    }
}

/// A photo of the server, such as a category's, loaded with the access token and kept while the app runs; the path
/// carries the photo's version, so a kept one is never stale. Until it comes, what is under it shows.
struct RemotePhoto: View {
    let path: String
    @Environment(Session.self) private var session
    @State private var image: Image?

    init(path: String) {
        self.path = path
        _image = State(initialValue: PhotoCache.shared.kept(path))
    }

    var body: some View {
        Color.clear
            .overlay {
                if let image { image.resizable().scaledToFill() }
            }
            .clipped()
            .task(id: path) { image = await PhotoCache.shared.image(path, session.client) }
    }
}

/// Photos already loaded, by path; the system's cache keeps them on the phone too, for when the server is away.
final class PhotoCache {
    static let shared = PhotoCache()
    private var images: [String: Image] = [:]

    func kept(_ path: String) -> Image? { images[path] }

    func image(_ path: String, _ client: APIClient?) async -> Image? {
        if let image = images[path] { return image }
        guard let client, let data = try? await client.photo(path), let image = Self.image(data) else { return nil }
        images[path] = image
        return image
    }

    private static func image(_ data: Data) -> Image? {
        #if os(iOS)
        UIImage(data: data).map { Image(uiImage: $0) }
        #else
        NSImage(data: data).map { Image(nsImage: $0) }
        #endif
    }
}

/// A photo picked for a category as the server takes it: a square of `side` pixels as a data URL. A photo is cut to
/// the square and sent as a JPEG; an image with a clear ground, such as an icon, fits into it whole with a margin and
/// stays a PNG, so the category's colour shows through it. The page does the same (see src/web/document.ts).
enum CategoryPhoto {
    nonisolated static let side = 240

    nonisolated static func dataURL(_ data: Data) -> String? {
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 1024,
        ] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options),
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        let clear = hasClearGround(image)
        let size = CGFloat(side), width = CGFloat(image.width), height = CGFloat(image.height)
        let scale = clear ? 0.72 * size / max(width, height) : size / min(width, height)
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: (size - width * scale) / 2, y: (size - height * scale) / 2, width: width * scale, height: height * scale))
        let out = NSMutableData()
        let type = clear ? UTType.png : UTType.jpeg
        guard let square = context.makeImage(), let destination = CGImageDestinationCreateWithData(out, type.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, square, clear ? nil : [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return "data:\(type.preferredMIMEType ?? "image/jpeg");base64,\((out as Data).base64EncodedString())"
    }

    /// Whether some of the image is see-through, judged on a small copy of it.
    nonisolated private static func hasClearGround(_ image: CGImage) -> Bool {
        if [.none, .noneSkipFirst, .noneSkipLast].contains(image.alphaInfo) { return false }
        let side = 32
        var pixels = [UInt8](repeating: 255, count: side * side * 4)
        pixels.withUnsafeMutableBytes { buffer in
            let context = CGContext(data: buffer.baseAddress, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            context?.clear(CGRect(x: 0, y: 0, width: side, height: side))
            context?.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
        }
        return stride(from: 3, to: pixels.count, by: 4).contains { pixels[$0] < 250 }
    }
}
