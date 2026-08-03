Pod::Spec.new do |s|
  s.name           = 'CirclesExpressiveInput'
  s.version        = '1.0.0'
  s.summary        = 'Private iOS expressive input bridge for Circles'
  s.description    = 'App-local Expo module used for Apple expressive image glyph input.'
  s.author         = 'Circles'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
