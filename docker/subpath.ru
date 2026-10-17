require_relative "/usr/src/redmine/config/environment"

map ENV.fetch("RAILS_RELATIVE_URL_ROOT") do
  run Rails.application
end
