require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'SupervisorNative'
  s.version = package['version']
  s.summary = 'Supervisor native bridge plugin'
  s.license = package['license']
  s.homepage = 'https://github.com/supervisor-standalone/supervisor-native'
  s.author = package['author']
  s.source = { :git => 'https://github.com/supervisor-standalone/supervisor-native.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '16.1'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
