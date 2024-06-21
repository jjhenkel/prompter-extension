"""
MultiClient is a class that wraps OpenAI using AzureOpenAI 
and a list of endpoints to provide a single interface to 
a "multi" client that will re-try requests to different
endpoints if the first one fails.
"""

from typing import Any, Callable, List, Tuple
from azure.identity import AzureCliCredential, get_bearer_token_provider
from openai import AzureOpenAI, OpenAIError, RateLimitError


class MultiClientException(Exception):
    """
    Exception raised when all clients fail to respond to a request.
    It contains the exception history and endpoint history.
    """

    def __init__(self, history: List[Tuple[Exception, str]]) -> None:
        super().__init__("All clients failed to respond to the request.")
        self.exception_history = [ex for ex, _ in history]
        self.endpoint_history = [endpoint for _, endpoint in history]


class MultiClient:
    """
    MultiClient is a class that wraps OpenAI using AzureOpenAI
    and a list of endpoints to provide a single interface to
    a "multi" client that will re-try requests to different
    endpoints if the first one fails.
    """

    BACKOFF_MAX_JITTER = 1000

    def __init__(
        self,
        endpoints: List[str],
        max_retries: int = 3,
        backoff_factor: int = 2,
        api_version: str = "2024-02-01",
    ) -> None:
        self.endpoints = endpoints
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.api_version = api_version
        self.current_client_index = 0
        self.clients = self._initialize_clients(endpoints)
        self._wrap_client_methods()

    def _current_endpoint(self) -> str:
        """Return the current endpoint."""
        return self.endpoints[self.current_client_index]

    def _initialize_clients(self, endpoints: List[str]) -> List[AzureOpenAI]:
        """Initialize AzureOpenAI clients for each endpoint."""
        clients = []
        for endpoint in endpoints:
            try:
                client = AzureOpenAI(
                    api_version=self.api_version,
                    azure_endpoint=endpoint,
                    azure_ad_token_provider=get_bearer_token_provider(
                        AzureCliCredential(),
                        "https://cognitiveservices.azure.com/.default",
                    ),
                )
                clients.append(client)
            except Exception as e:
                print(f"Failed to initialize client for endpoint {endpoint}: {e}")
        return clients

    def _wrap_client_methods(self) -> None:
        """Wrap client methods to use the multi-client retry logic."""
        for client in self.clients:
            client.chat.completions.create_i = client.chat.completions.create  # type: ignore

    def _switch_client(self) -> None:
        """Switch to the next client in the list."""
        self.current_client_index = (self.current_client_index + 1) % len(self.clients)

    def _make_request(self, method: str = "chat.completions.create", **kwargs) -> Any:
        """Make a request using the current client, retrying on failure."""
        history = []

        for attempt in range(self.max_retries):
            for _ in self.clients:
                client = self.clients[self.current_client_index]

                # Parse method and dynamically get the client method
                method_parts = method.split(".")
                func = client
                for part in method_parts:
                    func = getattr(func, part, None)
                    if func is None:
                        raise AttributeError(
                            f"Method {method} not found on AzureOpenAI client."
                        )

                try:
                    return func(**kwargs)  # type: ignore
                except (RateLimitError, OpenAIError) as e:
                    self._handle_exception(e, history, attempt)
                    break
                except Exception as e:
                    self._handle_general_exception(e, history, attempt)
                    break

        raise MultiClientException(history)

    def _handle_exception(
        self, e: Exception, history: List[Tuple[Exception, str]], attempt: int
    ) -> None:
        """Handle known exceptions and switch clients."""
        from time import sleep

        history.append((e, self._current_endpoint()))
        self._switch_client()
        sleep(self._calculate_backoff_time(attempt))

    def _handle_general_exception(
        self, e: Exception, history: List[Tuple[Exception, str]], attempt: int
    ) -> None:
        """Handle general exceptions and switch clients if applicable."""
        if "429" in str(e):
            self._handle_exception(e, history, attempt)
        else:
            print(f"Unknown Exception: {e}\nException History:")
            for i, ex in enumerate(history):
                print(f"Exception {i}: {ex[0]} at endpoint {ex[1]}")
            self._handle_exception(e, history, attempt)

    def _calculate_backoff_time(self, attempt: int) -> float:
        """Calculate the backoff time with jitter."""
        from random import uniform

        return self.backoff_factor**attempt + uniform(0, 1) * self.BACKOFF_MAX_JITTER

    @property
    def chat(self):
        """Return an object that has the completions property."""
        return self

    @property
    def completions(self):
        """Return an object that has the create property."""
        return self

    def create(self, **kwargs):
        """Create a chat completion."""
        return self._make_request("chat.completions.create", **kwargs)


# Default client for the package
default_client = MultiClient(
    [
        "https://gsl-azoai-1.openai.azure.com/",
        "https://gsl-azoai-2.openai.azure.com/",
        "https://gsl-azoai-3.openai.azure.com/",
        "https://gsl-azoai-4.openai.azure.com/",
        "https://gsl-azoai-8.openai.azure.com/",
        "https://gsl-azoai-9.openai.azure.com/",
    ]
)
