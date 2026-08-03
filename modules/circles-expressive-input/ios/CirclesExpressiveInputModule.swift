import ExpoModulesCore
import UIKit
import CoreText

private final class ExpressiveGlyphPickerViewController: UIViewController, UITextViewDelegate {
  var onComplete: (([String: Any]?) -> Void)?
  var onFailure: ((Error) -> Void)?

  private let textView = UITextView()
  private let statusLabel = UILabel()
  private var didFinish = false
  private var capturedIdentifiers = Set<String>()

  override func viewDidLoad() {
    super.viewDidLoad()
    configureView()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    DispatchQueue.main.async { [weak self] in
      self?.textView.becomeFirstResponder()
    }
  }

  private func configureView() {
    view.backgroundColor = .systemBackground
    navigationItem.title = "Apple Stickers"
    navigationItem.leftBarButtonItem = UIBarButtonItem(
      barButtonSystemItem: .cancel,
      target: self,
      action: #selector(cancel)
    )

    let icon = UIImageView(image: UIImage(systemName: "face.smiling"))
    icon.translatesAutoresizingMaskIntoConstraints = false
    icon.tintColor = .label
    icon.contentMode = .scaleAspectFit

    let titleLabel = UILabel()
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    titleLabel.text = "Choose a sticker from your keyboard"
    titleLabel.font = .preferredFont(forTextStyle: .headline)
    titleLabel.textAlignment = .center
    titleLabel.numberOfLines = 0

    let detailLabel = UILabel()
    detailLabel.translatesAutoresizingMaskIntoConstraints = false
    detailLabel.text = "Open the emoji keyboard, then choose a Sticker, Memoji, or Genmoji. Circles imports one at a time."
    detailLabel.font = .preferredFont(forTextStyle: .subheadline)
    detailLabel.textColor = .secondaryLabel
    detailLabel.textAlignment = .center
    detailLabel.numberOfLines = 0

    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    statusLabel.text = "Waiting for an Apple sticker…"
    statusLabel.font = .preferredFont(forTextStyle: .footnote)
    statusLabel.textColor = .tertiaryLabel
    statusLabel.textAlignment = .center
    statusLabel.numberOfLines = 0

    textView.translatesAutoresizingMaskIntoConstraints = false
    textView.delegate = self
    textView.backgroundColor = .secondarySystemBackground
    textView.layer.cornerRadius = 18
    textView.layer.cornerCurve = .continuous
    textView.textAlignment = .center
    textView.font = .systemFont(ofSize: 52)
    textView.tintColor = .systemBlue
    textView.textContainerInset = UIEdgeInsets(top: 14, left: 14, bottom: 14, right: 14)
    textView.autocorrectionType = .no
    textView.accessibilityLabel = "Apple sticker input"
    textView.accessibilityHint = "Open the emoji keyboard and choose a Sticker, Memoji, or Genmoji."
    textView.spellCheckingType = .no
    textView.smartQuotesType = .no
    textView.smartDashesType = .no
    textView.smartInsertDeleteType = .no

    if #available(iOS 18.0, *) {
      textView.supportsAdaptiveImageGlyph = true
    }

    view.addSubview(icon)
    view.addSubview(titleLabel)
    view.addSubview(detailLabel)
    view.addSubview(textView)
    view.addSubview(statusLabel)

    let guide = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      icon.topAnchor.constraint(equalTo: guide.topAnchor, constant: 28),
      icon.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
      icon.widthAnchor.constraint(equalToConstant: 42),
      icon.heightAnchor.constraint(equalToConstant: 42),

      titleLabel.topAnchor.constraint(equalTo: icon.bottomAnchor, constant: 16),
      titleLabel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
      titleLabel.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24),

      detailLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
      detailLabel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 28),
      detailLabel.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -28),

      textView.topAnchor.constraint(equalTo: detailLabel.bottomAnchor, constant: 22),
      textView.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
      textView.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24),
      textView.heightAnchor.constraint(equalToConstant: 92),

      statusLabel.topAnchor.constraint(equalTo: textView.bottomAnchor, constant: 12),
      statusLabel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
      statusLabel.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24),
    ])
  }

  @objc private func cancel() {
    finish(with: nil)
  }

  func textViewDidChange(_ textView: UITextView) {
    guard !didFinish else { return }

    if #available(iOS 18.0, *) {
      let attributed = textView.textStorage
      guard attributed.length > 0 else { return }

      var capturedGlyph: NSAdaptiveImageGlyph?
      attributed.enumerateAttribute(
        .adaptiveImageGlyph,
        in: NSRange(location: 0, length: attributed.length),
        options: []
      ) { value, _, stop in
        if let glyph = value as? NSAdaptiveImageGlyph,
           !self.capturedIdentifiers.contains(glyph.contentIdentifier) {
          capturedGlyph = glyph
          stop.pointee = true
        }
      }

      if let glyph = capturedGlyph {
        capturedIdentifiers.insert(glyph.contentIdentifier)
        statusLabel.text = "Importing…"
        textView.isEditable = false
        do {
          let payload = try exportGlyph(glyph)
          finish(with: payload)
        } catch {
          didFinish = true
          onFailure?(error)
        }
        return
      }

      if !attributed.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        statusLabel.text = "That was regular text or emoji. Choose a Sticker, Memoji, or Genmoji from the keyboard."
        textView.textStorage.setAttributedString(NSAttributedString(string: ""))
      }
    }
  }

  @available(iOS 18.0, *)
  private func exportGlyph(_ glyph: NSAdaptiveImageGlyph) throws -> [String: Any] {
    var imageOffset = CGPoint.zero
    var imageSize = CGSize.zero
    let proposedSize = CGSize(width: 512, height: 512)

    guard let cgImage = glyph.image(
      forProposedSize: proposedSize,
      scaleFactor: 1,
      imageOffset: &imageOffset,
      imageSize: &imageSize
    ) else {
      throw NSError(
        domain: "CirclesExpressiveInput",
        code: 1002,
        userInfo: [NSLocalizedDescriptionKey: "Apple returned a sticker that Circles could not render."]
      )
    }

    let image = UIImage(cgImage: cgImage, scale: 1, orientation: .up)
    guard let pngData = image.pngData() else {
      throw NSError(
        domain: "CirclesExpressiveInput",
        code: 1003,
        userInfo: [NSLocalizedDescriptionKey: "Circles could not convert this Apple sticker into an image."]
      )
    }

    let cacheDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("circles-expressive-input", isDirectory: true)
    try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    removeExpiredTemporaryFiles(in: cacheDirectory)

    let outputURL = cacheDirectory.appendingPathComponent("apple-glyph-\(UUID().uuidString).png")
    try pngData.write(to: outputURL, options: .atomic)

    return [
      "uri": outputURL.absoluteString,
      "mimeType": "image/png",
      "contentIdentifier": glyph.contentIdentifier,
      "contentDescription": glyph.contentDescription,
      "width": cgImage.width,
      "height": cgImage.height,
      "byteSize": pngData.count,
      "source": "apple_glyph",
    ]
  }

  private func removeExpiredTemporaryFiles(in directory: URL) {
    let expiration = Date().addingTimeInterval(-60 * 60 * 24 * 2)
    guard let urls = try? FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: [.contentModificationDateKey],
      options: [.skipsHiddenFiles]
    ) else { return }

    for url in urls {
      guard let values = try? url.resourceValues(forKeys: [.contentModificationDateKey]),
            let modified = values.contentModificationDate,
            modified < expiration else { continue }
      try? FileManager.default.removeItem(at: url)
    }
  }

  private func finish(with payload: [String: Any]?) {
    guard !didFinish else { return }
    didFinish = true
    textView.resignFirstResponder()
    onComplete?(payload)
  }
}

public class CirclesExpressiveInputModule: Module {
  private weak var activePicker: UIViewController?

  public func definition() -> ModuleDefinition {
    Name("CirclesExpressiveInput")

    Function("bridgeVersion") {
      return "apple-glyph-2"
    }

    Function("isAdaptiveImageGlyphSupported") {
      if #available(iOS 18.0, *) {
        return true
      }
      return false
    }

    AsyncFunction("discardTemporaryAppleGlyphAsync") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL else {
        promise.resolve(false)
        return
      }

      let cacheDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("circles-expressive-input", isDirectory: true)
        .standardizedFileURL
      let candidate = url.standardizedFileURL
      let cachePrefix = cacheDirectory.path.hasSuffix("/") ? cacheDirectory.path : cacheDirectory.path + "/"

      guard candidate.path.hasPrefix(cachePrefix) else {
        promise.resolve(false)
        return
      }

      do {
        if FileManager.default.fileExists(atPath: candidate.path) {
          try FileManager.default.removeItem(at: candidate)
        }
        promise.resolve(true)
      } catch {
        promise.reject(error)
      }
    }.runOnQueue(.main)

    AsyncFunction("pickAppleGlyphAsync") { (promise: Promise) in
      guard #available(iOS 18.0, *) else {
        promise.reject("ERR_APPLE_GLYPH_UNAVAILABLE", "Apple stickers require iOS 18 or later.")
        return
      }

      guard self.activePicker == nil else {
        promise.reject("ERR_APPLE_GLYPH_PICKER_BUSY", "The Apple sticker picker is already open.")
        return
      }

      guard let parent = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_APPLE_GLYPH_NO_VIEW_CONTROLLER", "Circles could not open the Apple sticker picker.")
        return
      }

      let picker = ExpressiveGlyphPickerViewController()
      let navigationController = UINavigationController(rootViewController: picker)
      navigationController.modalPresentationStyle = .pageSheet
      navigationController.isModalInPresentation = true
      if let sheet = navigationController.sheetPresentationController {
        sheet.detents = [.medium(), .large()]
        sheet.prefersGrabberVisible = true
        sheet.preferredCornerRadius = 28
      }

      picker.onComplete = { [weak self, weak navigationController] result in
        navigationController?.dismiss(animated: true)
        self?.activePicker = nil
        promise.resolve(result)
      }
      picker.onFailure = { [weak self, weak navigationController] error in
        navigationController?.dismiss(animated: true)
        self?.activePicker = nil
        promise.reject(error)
      }

      self.activePicker = navigationController
      parent.present(navigationController, animated: true)
    }.runOnQueue(.main)
  }
}
