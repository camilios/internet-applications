<?php

namespace App\Services\Messaging;

use Illuminate\Support\ConfigurationUrlParser;

class MailDeliveryConfiguration
{
    /** Returns the recorded delivery mode; mock mode never represents an external email. */
    public function assertDeliverable(): string
    {
        return $this->validateMailer((string) config('mail.default'), []);
    }

    private function validateMailer(string $name, array $ancestors): string
    {
        if ($name === '' || in_array($name, $ancestors, true)) {
            throw new MailDeliveryConfigurationException('Order email mailer configuration is missing or circular.');
        }
        $mailer = config('mail.mailers.'.$name);
        if (! is_array($mailer)) {
            throw new MailDeliveryConfigurationException('Order email mailer is not configured.');
        }
        if (isset($mailer['url'])) {
            try {
                // Mirror Laravel MailManager so a MAIL_URL override cannot hide a non-delivery transport.
                $mailer = (new ConfigurationUrlParser)->parseConfiguration($mailer);
                $mailer['transport'] = $mailer['driver'] ?? null;
            } catch (\Throwable) {
                throw new MailDeliveryConfigurationException('Order email mailer URL is invalid.');
            }
        }
        $transport = $mailer['transport'] ?? null;
        $explicitMock = config('mail.order_email_allow_mock') && app()->environment('local', 'testing');
        if (in_array($transport, ['array', 'log'], true) && $ancestors === []
            && ($explicitMock || ($transport === 'array' && app()->environment('testing')))) {
            return 'mock';
        }
        if (in_array($transport, ['failover', 'roundrobin'], true)) {
            $children = $mailer['mailers'] ?? [];
            if (! is_array($children) || $children === []) {
                throw new MailDeliveryConfigurationException('Order email composite mailer has no delivery transports.');
            }
            foreach ($children as $child) {
                if (! is_string($child)) {
                    throw new MailDeliveryConfigurationException('Order email composite mailer configuration is invalid.');
                }
                $this->validateMailer($child, [...$ancestors, $name]);
            }

            return 'external';
        }
        if (! in_array($transport, ['smtp', 'sendmail', 'mail', 'mailgun', 'ses', 'ses-v2', 'postmark', 'resend'], true)) {
            throw new MailDeliveryConfigurationException('Order emails require a delivery mailer. Explicit log/array mock mode is allowed only in local/testing environments; non-delivery fallbacks are not allowed.');
        }
        if ($transport === 'smtp') {
            $host = $mailer['host'] ?? '';
            $validHost = is_string($host) && (filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false || filter_var($host, FILTER_VALIDATE_IP) !== false);
            $validPort = filter_var($mailer['port'] ?? 25, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]) !== false;
            if (! $validHost || ! $validPort) {
                throw new MailDeliveryConfigurationException('Configure the external SMTP provider host and port before starting the order email worker.');
            }
        }

        return 'external';
    }
}
